import { useCallback, useEffect, useState } from "react";
import { messagingRequest } from "../../api/messagingApi.js";

export function useToolData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); setLoading(false); setError(""); return; }
    const controller = new AbortController();
    setData(null); setLoading(true); setError("");
    void messagingRequest(path, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setData(value);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { data, setData, error, loading, reload };
}

