const USER_COLORS = [
  "#66308d",
  "#007d71",
  "#25766e",
  "#4d5975",
  "#7c4d96",
  "#665478",
  "#4e6978",
  "#77634c",
];

function setUserColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
}

export { USER_COLORS, setUserColor };
