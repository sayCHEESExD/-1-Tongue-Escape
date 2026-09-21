import { CAMERA } from '@tongue/shared';
import { PerspectiveCamera, Vector3 } from 'three';

/**
 * Extra distance the camera starts a respawn from, in world units.
 *
 * A DELIBERATE effect, and not the artefact it replaces. Easing the follow
 * point across a respawn gap drags the camera through every position between
 * where the player died and where they came back; this moves only the DISTANCE
 * along the camera's own axis, so the shot is framed correctly throughout and
 * simply pulls in. Set to 0 to remove it.
 */
const RESPAWN_ZOOM_DISTANCE = 10;

/** How fast that extra distance is given up. Higher is snappier. */
const RESPAWN_ZOOM_RATE = 6.5;

/**
 * THE AIMING CAMERA, while the tongue deploys: a close chase shot on the
 * tongue TIP - the thing being aimed - from a fixed distance behind and a
 * little above it, facing the way the tip is travelling, so it stays near the
 * centre of the screen and the islands it is heading for are in view. The
 * distance never grows with the tongue: a long tongue is still easy to steer.
 */
const AIM_DISTANCE = 7.5;
const AIM_HEIGHT = 3.4;
/**
 * The aiming shot takes over as the tip travels out, fully once it is this far
 * from the player: until then the camera is still the normal one, so it never
 * ends up inside the player's own head.
 */
const AIM_TAKEOVER_DISTANCE = 9;
/** How far ahead of the tip the camera looks, so its direction reads. */
const AIM_LEAD = 2.5;
/** How fast the camera turns to follow the tip's heading. */
const AIM_TURN_RATE = 7;
/** How fast the aiming shot eases in on a throw, and back out to the normal view after. */
const AIM_IN_RATE = 6;
const AIM_OUT_RATE = 3.2;

const FORWARD = new Vector3();
const AIM_POSITION = new Vector3();
const AIM_LOOK = new Vector3();
const LOOK_TARGET = new Vector3();
const OFFSET = new Vector3();

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Third-person chase camera.
 *
 * The camera owns its OWN yaw and pitch, supplied by the mouse, and the mount
 * supplies only a position to orbit. That separation is the whole point: a
 * camera that trails the character's facing means pressing A turns the robot,
 * which turns the camera, which redefines what "forward" means - the classic
 * feedback loop where the movement keys end up steering the view.
 *
 * The simulation rotates its stick input by `yaw`, so the camera is the single
 * source of "which way is forward" and the robot's facing follows where it is
 * actually going.
 *
 * At speed it pulls back and widens. Late game runs at hundreds of units a
 * second, and a fixed camera makes the next gap arrive with no warning - the
 * dynamic framing is what buys the reaction time the obby needs.
 */
export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  /** Smoothed point the camera orbits. The only thing that is smoothed. */
  private readonly followed = new Vector3();

  private orbitYaw = 0;
  private orbitPitch = 0.2;
  private initialised = false;

  /** Extra distance still to be given up by the respawn dolly. */
  private zoomOffset = 0;

  /**
   * The player's wheel zoom: what they asked for, and where it has eased to.
   *
   * Distinct from `zoomOffset` above, which is the respawn dolly and decays to
   * nothing. This one is a PREFERENCE and persists - across deaths, rebirths
   * and stages - because a player who chose their framing has not asked to
   * choose it again every time they respawn.
   */
  private zoomTarget = 0;
  private zoomEased = 0;

  /** Eased 0..1 speed factor driving the dynamic distance and FOV. */
  private rush = 0;

  private aspect = 1;

  /** The tongue tip and its direction of travel while deploying. */
  private readonly tip = new Vector3();
  private readonly tipDir = new Vector3(0, 0, 1);
  private aiming = false;
  /** Eased 0..1: how much of the shot is the aiming camera. */
  private aimWeight = 0;
  /** The heading the aiming camera faces, eased toward the tip's. */
  private aimYaw = 0;

  constructor() {
    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, CAMERA.height, -CAMERA.distance);
  }

  /** Called by RendererManager whenever the drawing buffer changes size. */
  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The direction the camera faces. This is what "forward" means. */
  get yaw(): number {
    return this.orbitYaw;
  }

  /** Follow this position. The camera's own angles are unchanged. */
  setTarget(position: Vector3): void {
    this.target.copy(position);
  }

  /**
   * Arrive at a position instead of easing to it. Used for a PLACEMENT.
   *
   * The smoothing exists to absorb a player who MOVED; a respawn or a server
   * correction is a player who was PLACED, and easing across that gap is what
   * produces a camera sitting a whole stage behind a player who has already
   * arrived.
   *
   * @param zoomIn play the respawn dolly. TRUE only for a respawn; a network
   *               correction must arrive invisibly, not announce itself.
   */
  snapTo(position: Vector3, zoomIn = false): void {
    this.target.copy(position);
    this.followed.copy(position);
    this.initialised = true;
    this.zoomOffset = zoomIn ? RESPAWN_ZOOM_DISTANCE : 0;
  }

  /**
   * While the tongue deploys, pass its tip and direction of travel: the camera
   * eases in to a close shot on the tip and follows it. Pass null once the
   * tongue has frozen, and it eases back to the normal view.
   */
  setTongueAim(tip: Vector3 | null, direction?: Vector3): void {
    if (tip && !this.aiming && this.aimWeight === 0) this.aimYaw = this.orbitYaw;
    this.aiming = tip !== null;
    if (tip) this.tip.copy(tip);
    if (direction && direction.lengthSq() > 1e-8) this.tipDir.copy(direction).normalize();
  }

  /** Aim the orbit. Called every frame from the look source. */
  setOrbit(yaw: number, pitch: number): void {
    this.orbitYaw = yaw;
    this.orbitPitch = pitch;
  }

  /**
   * Push the camera out or pull it in, as an offset on the resting distance.
   *
   * Takes the input layer's ALREADY-CLAMPED accumulator, so the limits live in
   * one place. Called every frame like `setOrbit`; the easing below is what
   * turns a discrete wheel notch into a glide.
   */
  setZoom(offset: number): void {
    this.zoomTarget = offset;
  }

  /**
   * @param speed the mount's horizontal speed, for the dynamic framing.
   */
  update(delta: number, speed: number): void {
    // ONE smoothing stage, applied to the point the camera follows.
    //
    // Smoothing the camera POSITION while taking the look target raw makes the
    // two disagree every frame, which is exactly what reads as vibration
    // however gentle the smoothing is. Deriving both from one smoothed point
    // means they cannot disagree.
    if (!this.initialised) {
      this.followed.copy(this.target);
      this.initialised = true;
    } else {
      // Frame-rate independent exponential smoothing.
      this.followed.lerp(this.target, 1 - Math.exp(-CAMERA.followLerp * delta));
    }

    if (this.zoomOffset > 0) {
      this.zoomOffset *= Math.exp(-RESPAWN_ZOOM_RATE * delta);
      if (this.zoomOffset < 0.01) this.zoomOffset = 0;
    }

    // The rush factor is eased hard: pulling back has to lag the speed change
    // or every landing would punch the camera in and out.
    const targetRush = clamp(speed / CAMERA.speedReference, 0, 1);
    this.rush += (targetRush - this.rush) * (1 - Math.exp(-CAMERA.speedEase * delta));

    // The player's zoom eases the same frame-rate independent way the follow
    // point does, so a notch glides rather than snapping.
    this.zoomEased +=
      (this.zoomTarget - this.zoomEased) * (1 - Math.exp(-CAMERA.zoomEase * delta));

    // Never let the sum reach the mount: the limits already guarantee it, and
    // this is what keeps that true if the framing is ever retuned.
    const distance = Math.max(
      1,
      CAMERA.distance + this.zoomEased + this.zoomOffset + CAMERA.speedDistance * this.rush,
    );
    const fov = CAMERA.fov + CAMERA.speedFov * this.rush;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Where the camera sits: back along its own yaw, lifted by its pitch. The
    // pitch shortens the horizontal reach as it rises, so the camera swings
    // over the mount rather than sliding away from it.
    const cosPitch = Math.cos(this.orbitPitch);
    const sinPitch = Math.sin(this.orbitPitch);

    FORWARD.set(
      Math.sin(this.orbitYaw) * cosPitch,
      0,
      Math.cos(this.orbitYaw) * cosPitch,
    );

    // Applied directly, not lerped again: the look angles must never lag the
    // mouse, and the follow point is already smooth.
    this.camera.position
      .copy(this.followed)
      .addScaledVector(FORWARD, -distance)
      .add(OFFSET.set(0, CAMERA.height + sinPitch * distance, 0));

    LOOK_TARGET.copy(this.followed).add(OFFSET.set(0, CAMERA.lookAtHeight, 0));

    // The aiming shot on the tongue tip, blended in and out.
    this.aimWeight += ((this.aiming ? 1 : 0) - this.aimWeight) * (1 - Math.exp(-(this.aiming ? AIM_IN_RATE : AIM_OUT_RATE) * delta));
    if (!this.aiming && this.aimWeight < 0.002) this.aimWeight = 0;
    if (this.aimWeight > 0) {
      const flat = Math.hypot(this.tipDir.x, this.tipDir.z);
      if (this.aiming && flat > 0.05) {
        const want = Math.atan2(this.tipDir.x, this.tipDir.z);
        let turn = want - this.aimYaw;
        turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
        this.aimYaw += turn * (1 - Math.exp(-AIM_TURN_RATE * delta));
      }
      const back = FORWARD.set(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw));
      AIM_POSITION.copy(this.tip).addScaledVector(back, -AIM_DISTANCE);
      AIM_POSITION.y += AIM_HEIGHT;
      // Look just ahead of the tip - mostly sideways, barely up or down - so the
      // tip itself stays near the centre however steeply it climbs or dives.
      AIM_LOOK.set(
        this.tip.x + this.tipDir.x * AIM_LEAD,
        this.tip.y + this.tipDir.y * AIM_LEAD * 0.3 + 0.4,
        this.tip.z + this.tipDir.z * AIM_LEAD,
      );
      const out = Math.min(1, this.tip.distanceTo(this.target) / AIM_TAKEOVER_DISTANCE);
      const eased = this.aimWeight * (out * out * (3 - 2 * out));
      const w = eased * eased * (3 - 2 * eased);
      this.camera.position.lerp(AIM_POSITION, w);
      LOOK_TARGET.lerp(AIM_LOOK, w);
    }
    this.camera.lookAt(LOOK_TARGET);
  }
}
