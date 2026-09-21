import { DEATH_HOLD_SECONDS } from '@tongue/shared';
import type { PoseDefinition } from '../animation/PoseBuffer.js';

const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Procedural animation tuning.
 *
 * Data-driven on purpose: every number the animator uses lives here, so the
 * character can be re-tuned without touching a line of logic. All rotations
 * are in CHARACTER space (see `PlayerRig`).
 */

/** The walk/run/sprint cycle. ONE cycle, three depths. */
export const LOCOMOTION = {
  /** Cycle frequency clamp, in cycles per second. */
  minFrequency: 0.7,
  maxFrequency: 3.4,
  /** World units between two footfalls at a run. */
  strideDistance: 5.2,
  /** Below this speed the character is standing still. */
  idleSpeed: 0.6,
  /** Speed at which the WALK pose is fully in, before the multiplier. */
  walkSpeed: 4,
  /** Speed at which the RUN pose is fully in, before the multiplier. */
  runSpeed: 15,
  /** Speed at which the SPRINT pose is fully in, before the multiplier. */
  sprintSpeed: 27,

  hipSwing: { walk: deg(22), run: deg(40), sprint: deg(58) },
  kneeBend: { walk: deg(30), run: deg(58), sprint: deg(74) },
  armSwing: { walk: deg(18), run: deg(38), sprint: deg(60) },
  elbowBend: { walk: deg(14), run: deg(46), sprint: deg(74) },
  torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
  /** Forward lean of the spine. A sprinter leans INTO it. */
  torsoLean: { walk: deg(3), run: deg(11), sprint: deg(24) },
  headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
  torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
  /** Vertical bob, in world units, twice per cycle. */
  bob: { walk: 0.05, run: 0.11, sprint: 0.16 },
  /** How far the whole body banks into a turn. */
  bankAngle: deg(9),
  bankRate: 8,
} as const;

/** The idle: breathing, and nothing else. */
export const IDLE = {
  breathFrequency: 0.35,
  breathAmount: deg(1.8),
  breathBob: 0.012,
  basePose: {
    ArmL1: { x: deg(4), z: deg(6) },
    ArmR1: { x: deg(4), z: deg(-6) },
    ArmL2: { x: deg(10) },
    ArmR2: { x: deg(10) },
  } satisfies PoseDefinition,
} as const;

/**
 * THE TONGUE THROW, in three beats that match the simulation's phases.
 *
 * WINDUP: the head tilts right back, the chest opens and the arms haul back -
 * visible EFFORT loading the throw. THROW: everything snaps forward as the
 * tongue leaves, head first. GLIDE: stretched out and reeled along the tongue,
 * legs trailing.
 */
export const TONGUE_POSES = {
  windup: {
    Neck1: { x: deg(42) },
    Spine2: { x: deg(14) },
    Spine1: { x: deg(10) },
    ArmL1: { x: deg(38), z: deg(38) },
    ArmR1: { x: deg(38), z: deg(-38) },
    ArmL2: { x: deg(55) },
    ArmR2: { x: deg(55) },
    LegL1: { x: deg(-16) },
    LegR1: { x: deg(12) },
    LegL2: { x: deg(26) },
    LegR2: { x: deg(22) },
  } satisfies PoseDefinition,
  throw: {
    Neck1: { x: deg(-30) },
    Spine2: { x: deg(-12) },
    Spine1: { x: deg(-18) },
    ArmL1: { x: deg(62), z: deg(22) },
    ArmR1: { x: deg(62), z: deg(-22) },
    ArmL2: { x: deg(20) },
    ArmR2: { x: deg(20) },
    LegL1: { x: deg(-34) },
    LegR1: { x: deg(26) },
    LegL2: { x: deg(22) },
    LegR2: { x: deg(38) },
  } satisfies PoseDefinition,
  glide: {
    Neck1: { x: deg(-18) },
    Spine2: { x: deg(-8) },
    Spine1: { x: deg(-14) },
    ArmL1: { x: deg(74), z: deg(26) },
    ArmR1: { x: deg(74), z: deg(-26) },
    ArmL2: { x: deg(14) },
    ArmR2: { x: deg(14) },
    LegL1: { x: deg(24) },
    LegR1: { x: deg(36) },
    LegL2: { x: deg(42) },
    LegR2: { x: deg(30) },
  } satisfies PoseDefinition,
  /** How far the whole body leans back in the windup and forward on the ride. */
  windupLean: deg(-10),
  throwLean: deg(14),
  glideLean: deg(26),
  /** A little crouch as the effort builds. */
  windupBob: -0.14,
} as const;

/** Falling off a ledge: arms up, legs loose. */
export const AIRBORNE = {
  velocityReference: 14,
  fall: {
    LegL1: { x: deg(14) },
    LegR1: { x: deg(-8) },
    LegL2: { x: deg(30) },
    LegR2: { x: deg(20) },
    ArmL1: { x: deg(-120), z: deg(30) },
    ArmR1: { x: deg(-120), z: deg(-30) },
    ArmL2: { x: deg(30) },
    ArmR2: { x: deg(30) },
    Spine1: { x: deg(10) },
    Neck1: { x: deg(6) },
  } satisfies PoseDefinition,
} as const;

/** The landing crouch. Short: a runner lands and keeps going. */
export const LANDING = {
  duration: 0.16,
  pose: {
    LegL1: { x: deg(-34) },
    LegR1: { x: deg(-34) },
    LegL2: { x: deg(58) },
    LegR2: { x: deg(58) },
    ArmL1: { x: deg(-18), z: deg(20) },
    ArmR1: { x: deg(-18), z: deg(-20) },
    Spine1: { x: deg(14) },
  } satisfies PoseDefinition,
  bobY: -0.32,
} as const;

/** The fall-over. Readable, brief, and deliberately not gruesome. */
export const DEATH = {
  /** THE SERVER'S NUMBER. See `DEATH_HOLD_SECONDS`. */
  duration: DEATH_HOLD_SECONDS,
  /** How far the body keels over sideways, in radians. */
  roll: deg(88),
  /** How far it pitches forward as it goes. */
  pitch: deg(18),
  /** How far the body sinks. */
  drop: 0.9,
  pose: {
    ArmL1: { x: deg(-80), z: deg(30) },
    ArmR1: { x: deg(-80), z: deg(-30) },
    LegL1: { x: deg(-20) },
    LegR1: { x: deg(10) },
    Spine1: { x: deg(10) },
    Neck1: { x: deg(-12) },
  } satisfies PoseDefinition,
} as const;

/** Seconds a pose change takes to blend in. */
export const TRANSITIONS = {
  toLocomotion: 0.14,
  toWindup: 0.08,
  toThrow: 0.05,
  toGlide: 0.12,
  toAirborne: 0.16,
  toLanding: 0.06,
  toDeath: 0.12,
} as const;
