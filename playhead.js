// The film's playhead, with a speed limit.
//
// Scrolling moves a *target* time; the playhead follows it with smoothing,
// but never faster than a maximum rate — and a much lower rate inside
// transition zones. A hard flick of the wheel therefore can't skip a
// transition: the film briefly trails the scrollbar and catches up, and every
// cover/reveal is seen whole (≈ zoneLength / transitionRate seconds).
//
//   const playhead = createPlayhead(tl, { zones: [[1.9, 2.8], ...] });
//   ScrollTrigger.create({ ..., onUpdate: (self) => playhead.seek(self.progress * total) });
//   gsap.ticker.add((time, dt) => playhead.update(dt / 1000));
//
// Units are timeline seconds (1 = one viewport of scroll in scroll-cinema).

export function createPlayhead(tl, {
  zones = [],            // [start, end] timeline ranges where transitions play
  freeRate = 2.4,        // max timeline units per second outside zones
  transitionRate = 0.65, // max units per second inside zones
  smoothing = 3.5,       // how quickly the playhead closes the gap (1/s), like scrub
  reduced = false,       // prefers-reduced-motion: follow the scroll exactly
} = {}) {
  let time = 0;
  let target = 0;
  let boost = 1;         // temporary rate multiplier for menu jumps

  const inZone = (t) => zones.some(([a, b]) => t >= a && t <= b);

  return {
    get time() { return time; },
    get target() { return target; },
    seek(t) { target = t; },
    // Let a deliberate jump (nav click) move faster; resets when it arrives.
    rush(factor = 4) { boost = factor; },
    update(dt) {
      if (reduced) {
        if (time !== target) { time = target; tl.time(time); }
        return;
      }
      const gap = target - time;
      if (Math.abs(gap) < 1e-4) {
        boost = 1;
        if (gap !== 0) { time = target; tl.time(time); }
        return;
      }
      const step = gap * (1 - Math.exp(-smoothing * dt));
      // Moving forward the relevant zone is the one ahead of us, backward the one behind.
      const probe = time + Math.sign(gap) * 0.02;
      const limit = (inZone(time) || inZone(probe) ? transitionRate : freeRate) * boost * dt;
      time += Math.max(-limit, Math.min(limit, step));
      tl.time(time);
    },
  };
}

// Transition zones from scene starts: each scene (except the first) begins
// with a transition of `length` timeline units. `lead` covers moves that
// start slightly before the veil (e.g. a camera dive into the hero).
export function zonesFromStarts(starts, length, lead = 0.05) {
  return starts.slice(1).map((s) => [s - lead, s + length + 0.05]);
}
