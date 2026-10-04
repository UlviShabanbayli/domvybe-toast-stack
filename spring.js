// A spring, written from scratch: a mass on a spring with a damper.
//   acceleration = stiffness × (target − value) − damping × velocity
// It is stepped in small fixed slices (1/240 s), so it moves the same on a 60 Hz and a 120 Hz screen.
// Changing the target never moves the value: an interrupted animation just bends towards the new target.
class Spring {
  constructor(value = 0, { stiffness = 170, damping = 26 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  set(options) { Object.assign(this, options); return this; }

  step(dt) {
    const slice = 1 / 240;
    for (let t = dt; t > 0; t -= slice) {
      const h = Math.min(slice, t);
      const acceleration = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
      this.velocity += acceleration * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  resting(epsilon = 0.01) {
    return Math.abs(this.target - this.value) < epsilon && Math.abs(this.velocity) < epsilon * 10;
  }
}
