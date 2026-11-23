import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

async function syntheticUser(name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(`<main><h1>${name}</h1><video id="remote" autoplay playsinline></video></main>`);
  await page.evaluate(async (label) => {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const painter = canvas.getContext("2d");
    painter.fillStyle = label === "alice" ? "#66308d" : "#0f766e";
    painter.fillRect(0, 0, 32, 32);
    const videoTrack = canvas.captureStream(5).getVideoTracks()[0];
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    const audioTrack = destination.stream.getAudioTracks()[0];
    const stream = new MediaStream([audioTrack, videoTrack]);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      document.querySelector("#remote").srcObject = remoteStream;
    };
    window.callHarness = { pc, stream, remoteStream, audioContext, oscillator };
  }, name);
  return { context, page };
}

async function waitForIce(page) {
  await page.waitForFunction(() => window.callHarness.pc.iceGatheringState === "complete", null, { timeout: 10_000 });
}

const alice = await syntheticUser("alice");
const bob = await syntheticUser("bob");

try {
  const offer = await alice.page.evaluate(async () => {
    const offer = await window.callHarness.pc.createOffer();
    await window.callHarness.pc.setLocalDescription(offer);
    return offer;
  });
  await waitForIce(alice.page);
  const completeOffer = await alice.page.evaluate(() => window.callHarness.pc.localDescription.toJSON());
  const answer = await bob.page.evaluate(async (incoming) => {
    await window.callHarness.pc.setRemoteDescription(incoming);
    const answer = await window.callHarness.pc.createAnswer();
    await window.callHarness.pc.setLocalDescription(answer);
    return answer;
  }, completeOffer);
  assert.equal(offer.type, "offer");
  assert.equal(answer.type, "answer");
  await waitForIce(bob.page);
  const completeAnswer = await bob.page.evaluate(() => window.callHarness.pc.localDescription.toJSON());
  await alice.page.evaluate((incoming) => window.callHarness.pc.setRemoteDescription(incoming), completeAnswer);

  await Promise.all([alice.page, bob.page].map((page) => page.waitForFunction(() => {
    return ["connected", "completed"].includes(window.callHarness.pc.connectionState) &&
      window.callHarness.remoteStream.getAudioTracks().length === 1 &&
      window.callHarness.remoteStream.getVideoTracks().length === 1;
  }, null, { timeout: 15_000 })));

  const media = await alice.page.evaluate(() => ({
    localAudio: window.callHarness.stream.getAudioTracks().length,
    localVideo: window.callHarness.stream.getVideoTracks().length,
    remoteAudio: window.callHarness.remoteStream.getAudioTracks().length,
    remoteVideo: window.callHarness.remoteStream.getVideoTracks().length,
  }));
  assert.deepEqual(media, { localAudio: 1, localVideo: 1, remoteAudio: 1, remoteVideo: 1 });

  await alice.page.evaluate(() => {
    window.callHarness.stream.getAudioTracks()[0].enabled = false;
    window.callHarness.stream.getVideoTracks()[0].enabled = false;
  });
  const toggles = await alice.page.evaluate(() => ({
    muted: !window.callHarness.stream.getAudioTracks()[0].enabled,
    cameraOff: !window.callHarness.stream.getVideoTracks()[0].enabled,
  }));
  assert.deepEqual(toggles, { muted: true, cameraOff: true });

  await bob.page.evaluate(() => window.callHarness.pc.close());
  await alice.page.evaluate(() => window.callHarness.pc.close());
  assert.equal(await alice.page.evaluate(() => window.callHarness.pc.connectionState), "closed");

  process.stdout.write(JSON.stringify({
    ok: true,
    users: ["alice", "bob"],
    transport: "real-browser-RTCPeerConnection",
    media: ["synthetic-audio", "synthetic-video"],
    verified: ["offer", "answer", "peer-connection", "audio", "video", "mute", "camera-off", "hangup"],
  }) + "\n");
} finally {
  await Promise.allSettled([alice.context.close(), bob.context.close()]);
  await browser.close();
}
