
import { state } from "@/core/state.js";
 
/* Gaze vector (-1..1, mirrored) -> normalized screen point (0..1). */
export function gazeToScreen(g) {
  // The mirror flips x; amplify slightly so edges are reachable
  const x = 0.5 + -g.x * 0.55;
  const y = 0.5 + g.y * 0.55;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}
 
export function createOrb() {
  return {
    // Normalized position and velocity (0..1 space)
    x: 0.5,
    y: 0.5,
    vx: (Math.random() - 0.5) * 0.010,
    vy: (Math.random() - 0.5) * 0.010,
    radius: 0.05,          // fraction of min(canvas w, h)
    wanderTimer: 0,
    targetVx: 0,
    targetVy: 0,
 
    /* Advance physics. dt in seconds, entropy 0..1 from telemetry. */
    update(dt, entropy) {
      // Base speed rises with entropy; direction changes get frequent
      const baseSpeed = 0.14 + entropy * 0.55;      // per second
      const wanderInterval = 1.4 - entropy * 1.05;  // seconds between turns
 
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        // Pick a new random heading. Entropy widens the turn and can
        // add sudden darts (chaotic bursts).
        const angle = Math.random() * Math.PI * 2;
        const burst = entropy > 0.5 && Math.random() < entropy ? 1.9 : 1.0;
        const speed = baseSpeed * burst * (0.6 + Math.random() * 0.8);
        this.targetVx = Math.cos(angle) * speed;
        this.targetVy = Math.sin(angle) * speed;
        this.wanderTimer = Math.max(0.15, wanderInterval * (0.5 + Math.random()));
      }
 
      // Ease toward the target heading; high entropy = snappier, jerkier
      const ease = 0.6 + entropy * 2.4;
      this.vx += (this.targetVx - this.vx) * Math.min(1, ease * dt);
      this.vy += (this.targetVy - this.vy) * Math.min(1, ease * dt);
 
      // Small chaotic jitter scaled by entropy
      if (entropy > 0.25) {
        this.vx += (Math.random() - 0.5) * entropy * 0.02;
        this.vy += (Math.random() - 0.5) * entropy * 0.02;
      }
 
      this.x += this.vx * dt;
      this.y += this.vy * dt;
 
      // Bounce off the walls, keeping the orb fully on-screen
      const r = this.radius;
      if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); this.targetVx = Math.abs(this.targetVx); }
      if (this.x > 1 - r) { this.x = 1 - r; this.vx = -Math.abs(this.vx); this.targetVx = -Math.abs(this.targetVx); }
      if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); this.targetVy = Math.abs(this.targetVy); }
      if (this.y > 1 - r) { this.y = 1 - r; this.vy = -Math.abs(this.vy); this.targetVy = -Math.abs(this.targetVy); }
    },
  };
}
 
export function createGame() {
  return {
    score: 0,
    streak: 0,       // consecutive seconds locked on
    bestStreak: 0,
    onTarget: false,
    lockTime: 0,     // total seconds the gaze held the orb
 
    /* dist: normalized distance from gaze to orb center.
       hitRadius: normalized radius counting as "on the orb". */
    update(dt, dist, hitRadius) {
      this.onTarget = dist < hitRadius;
      if (this.onTarget) {
        this.streak += dt;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        this.lockTime += dt;
        // Score grows faster the longer the streak: reward sustained focus
        const multiplier = 1 + Math.min(4, this.streak * 0.6);
        this.score += dt * 40 * multiplier;
      } else {
        this.streak = 0;
      }
    },
  };
}
 
/* Convenience: current entropy from shared state, clamped. */
export function currentEntropy() {
  return Math.min(1, Math.max(0, state.entropySm || 0));
}
 