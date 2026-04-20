/**
 * Update `#clockStr` (top chrome "sat · apr 18 · 09:14") and `#miniClock`
 * ("09:14:22") on a 1 s interval. Returns a disposer fn.
 */
export function initClock(): () => void {
  const clockStr = document.getElementById("clockStr");
  const mini = document.getElementById("miniClock");

  const tick = (): void => {
    const now = new Date();
    const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()]!;
    const mon = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ][now.getMonth()]!;
    const day = now.getDate();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    if (clockStr) clockStr.textContent = `${dow} · ${mon} ${day} · ${hh}:${mm}`;
    if (mini) mini.textContent = `${hh}:${mm}:${ss}`;
  };

  tick();
  const handle = window.setInterval(tick, 1000);
  return () => window.clearInterval(handle);
}
