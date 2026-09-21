import {
  SPAWN_POSITION,
  STAGES,
  TonguePhase,
  TongueControl,
  canRebirth,
  formatWins,
  type NoticeMessage,
  type RespawnMessage,
  type StageAwardedMessage,
} from '@tongue/shared';
import { Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { lookFromLegion } from '../bloxity/avatarLook.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RunController } from '../progression/RunController.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { Panel, anyPanelOpen } from '../ui/Panel.js';
import { RailButton } from '../ui/RailButton.js';
import { RebirthPanel } from '../ui/RebirthPanel.js';
import { HintLine, Toasts } from '../ui/Toasts.js';
import { LevelUpPopup } from '../ui/LevelUpPopup.js';
import { TongueHud } from '../ui/TongueHud.js';
import { TrailsPanel } from '../ui/TrailsPanel.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { ICONS } from '../ui/hudStyles.js';
import { injectTongueStyles } from '../ui/tongueStyles.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';

const SCOPE = 'Game';

const shortcutOf = (event: KeyboardEvent): string => {
  const code = event.code;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code) return code.toLowerCase();
  return (event.key || '').toLowerCase();
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/**
 * Composition root. Owns every subsystem and the per-frame order - input,
 * prediction, triggers, camera, network, render - and no gameplay rules.
 */
/** Scratch for the tongue tip the camera leans toward. */
const TIP = new Vector3();
const TIP_DIR = new Vector3();

export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly hud: TongueHud;
  private readonly wins: WinsCounter;
  private readonly hint: HintLine;
  private readonly toasts: Toasts;
  private readonly levelUp: LevelUpPopup;
  private readonly rail: HTMLDivElement;
  private readonly trailsButton: RailButton;
  private readonly rebirthButton: RailButton;
  private readonly audioButton: RailButton;
  private readonly audio = new AudioManager();
  private readonly bloxity: Bloxity;
  private readonly bloxityPanel: BloxityPanel;
  private readonly fpsReadout: HTMLDivElement;
  private dresser: AvatarDresser | null = null;
  private pendingAvatar: (() => void) | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private readonly playerAudio: PlayerAudio;
  private readonly rebirthPanel: RebirthPanel;
  private readonly trailsPanel: TrailsPanel;
  private readonly network: NetworkClient;
  private readonly world = new CourseWorld();
  private readonly run: RunController;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private local: NetPlayerState | null = null;

  private lastLevel = -1;
  private lastLength = 0;
  private lastRebirths = -1;
  private pendingRespawn: RespawnMessage | null = null;

  constructor(container: HTMLElement) {
    injectTongueStyles();
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.hud = new TongueHud(container);
    this.wins = new WinsCounter(container);
    this.hint = new HintLine(container);
    this.toasts = new Toasts(container);
    this.levelUp = new LevelUpPopup(container);

    this.rail = document.createElement('div');
    this.rail.className = 'aoe-rail';
    container.appendChild(this.rail);

    this.rebirthPanel = new RebirthPanel(container, () => this.network.requestRebirth());
    this.trailsPanel = new TrailsPanel(container, {
      unlock: (slot) => this.network.unlockTrail(slot),
      equip: (slot) => this.network.equipTrail(slot),
    });

    this.trailsButton = new RailButton(this.rail, {
      variant: 'trails',
      label: 'Trails',
      icon: ICONS.trail,
      hotkey: 'T',
      onClick: () => this.openOnly(this.trailsPanel),
    });
    this.rebirthButton = new RailButton(this.rail, {
      variant: 'rebirth',
      label: 'Rebirth',
      icon: ICONS.rebirth,
      hotkey: 'R',
      onClick: () => this.openOnly(this.rebirthPanel),
    });
    this.audioButton = new RailButton(this.rail, {
      variant: 'audio',
      label: 'Music',
      icon: ICONS.audio,
      hotkey: 'M',
      onClick: () => {
        const muted = this.audio.toggleMuted();
        this.audioButton.root.classList.toggle('aoe-tile--off', muted);
      },
    });

    this.playerAudio = new PlayerAudio(this.audio);

    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.audio.setMusicVolume(level),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      respawn: () => this.network.requestRespawn(),
      pointerLockChanged: (locked) => this.input.look.setCursorFree(!locked),
      avatarChanged: (equipped, proportions) => {
        const look = lookFromLegion(equipped, proportions);
        this.network.sendAvatar(look);
        const apply = (): void => this.dresser?.setLook(look.appearance, look.proportions);
        if (this.dresser) apply();
        else this.pendingAvatar = apply;
      },
    });

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'aoe-fps aoe-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    this.bloxityPanel = new BloxityPanel(container, this.bloxity);

    window.addEventListener('keydown', this.onHotkey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });

    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
        const roomId = this.network.roomId;
        this.bloxity.updateRoom(roomId);
        this.bloxityPanel.setRoom(roomId);
      },
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) => {
        this.pendingRespawn = message;
        this.localPlayer?.acknowledgeRespawn();
        this.applyPendingRespawn();
      },
      onStageAwarded: (message) => this.onStageAwarded(message),
      onNotice: (message) => this.onNotice(message),
    });

    this.network.setTokenProvider(() => this.bloxity.getToken());
    this.network.setLookProvider(() => lookFromLegion(this.bloxity.getEquipped(), this.bloxity.getProportions()));
    this.network.setDisplayProvider(() => identityFromLegion(this.bloxity.getUser(), this.bloxity.getGuest()));
    this.bloxity.onUserChanged((user) => {
      this.network.sendAuth(this.bloxity.getToken());
      this.network.sendIdentity(identityFromLegion(user, this.bloxity.getGuest()));
    });

    this.run = new RunController(this.world.collision, {
      claimStage: (index) => {
        this.flushInput();
        this.network.claimStage(index);
      },
      tonguePad: (slot) => {
        this.flushInput();
        this.network.tonguePad(slot);
      },
    });
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;
    if (isTyping(event.target)) return;
    switch (shortcutOf(event)) {
      case 'r':
        this.rebirthButton.press();
        break;
      case 't':
        this.trailsButton.press();
        break;
      case 'm':
        this.audioButton.press();
        break;
      case 'escape':
        for (const panel of this.panels) panel.setOpen(false);
        this.input.look.setCursorFree(true);
        this.bloxity.showPortalMenu(true);
        break;
      default:
        break;
    }
  };

  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.5) return;
    this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS`;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }

  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private openOnly(panel: Panel): void {
    for (const other of this.panels) if (other !== panel) other.setOpen(false);
    panel.toggle();
  }

  private get panels(): readonly Panel[] {
    return [this.rebirthPanel, this.trailsPanel];
  }

  startBloxity(): void {
    this.bloxity.start();
    document.body.classList.toggle('aoe-portal-embedded', this.bloxity.embedded);
  }

  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  async initialise(): Promise<PlayerModelReport> {
    this.world.addTo(this.sceneManager.scene);
    const report = await playerModelLoader.load();

    this.localPlayer = new LocalPlayer(this.world.collision);
    this.dresser = new AvatarDresser(this.localPlayer.character);
    this.pendingAvatar?.();
    this.pendingAvatar = null;

    this.sceneManager.scene.add(this.localPlayer.character.root);
    this.sceneManager.scene.add(this.localPlayer.character.worldRoot);
    this.camera.snapTo(this.localPlayer.position);

    logger.info(SCOPE, 'world ready');
    return report;
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  stop(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    this.bloxity.updateRoom('');
    void this.network.disconnect();
  }

  update(delta: number, _now: number): void {
    this.input.setSuppressed(anyPanelOpen());
    const input = this.input.sample();
    const player = this.localPlayer;

    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);
    this.camera.setZoom(this.input.look.zoom);

    if (player) {
      player.update(delta, input, this.input.look.yaw);
      this.run.update(delta, player);

      if (player.deathComplete) this.applyPendingRespawn();
      if (player.consumeRespawnNudge()) {
        logger.warn(SCOPE, 'death was not acknowledged; requesting a respawn');
        this.network.requestRespawn();
      }

      this.snapCameraIfPlaced();
      this.camera.setTarget(player.position);
      // While the tongue deploys, the camera aims along it from just behind the tip.
      this.camera.setTongueAim(player.tongueAim(TIP, TIP_DIR) ? TIP : null, TIP_DIR);
      this.world.winTrophies.follow(player.position);
      this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);
      this.flushInput();
      this.playerAudio.update(delta, {
        horizontalSpeed: player.horizontalSpeed,
        maxRunSpeed: player.maxRunSpeed,
        isGrounded: player.isGrounded,
        isDying: player.isDying,
        onTreadmill: player.onTreadmill,
        thrownEdge: player.thrownEdge,
        attachedEdge: player.attachedEdge,
        landedEdge: player.landedEdge,
      });
      this.updateHint(player);
    }

    this.tickFps(delta);
    const board = this.network.leaderboard;
    if (board) this.world.scoreboard.update(board);
    this.world.update(delta, player?.position.x ?? SPAWN_POSITION.x, player?.position.z ?? SPAWN_POSITION.z);
    this.remotePlayers.advance(delta, player?.position ?? null);
    // A ride is fast: the camera pulls back with it, which is most of the rush.
    const riding = player && player.tonguePhase === TonguePhase.Glide;
    this.camera.update(delta, riding ? player.velocity.length() : (player?.horizontalSpeed ?? 0));

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  /** One short line saying what to do next. */
  private updateHint(player: LocalPlayer): void {
    const state = this.local;
    if (!state) return;
    const z = player.position.z;
    // The next stage ahead that asks for more tongue than this player has.
    const ahead = STAGES.find((stage) => z > stage.startZ - 30 && z < stage.startZ + 10 && state.level < stage.recommendedLevel);
    let text = '';
    if (player.tonguePhase === TonguePhase.Windup || player.tonguePhase === TonguePhase.Extend) {
      const touch = document.body.classList.contains('aoe-touch-mode');
      if (player.tongueControl === TongueControl.Player) {
        text = touch ? 'Steering: stick up to climb, down to dive, sideways to curve' : 'Steering: W climb, S dive, A / D curve';
      } else {
        text = touch ? 'Move the stick to steer the tongue yourself' : 'Press W A S D to steer the tongue yourself';
      }
    } else if (canRebirth(state.level, state.rebirths)) {
      text = 'You can Rebirth! Open the Rebirth menu (R)';
    } else if (state.bestStage === 0 && state.wins === 0 && z < 0) {
      text = document.body.classList.contains('aoe-touch-mode')
        ? 'Tap TONGUE to throw your tongue across the lava!'
        : 'Click or press Space to throw your tongue across the lava!';
    } else if (ahead) {
      text = `Stage ${ahead.index} needs a longer tongue: reach Level ${ahead.recommendedLevel}!`;
    } else if (state.wins >= 1 && state.ownedTongues === 0 && z < 0) {
      text = 'Buy the Blueberry Tongue on the stage to your left!';
    } else if (z < 0 && state.level < 3) {
      text = 'Walk or train on a treadmill to grow your tongue';
    }
    this.hint.set(text);
  }

  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  private applyPendingRespawn(): void {
    const player = this.localPlayer;
    const message = this.pendingRespawn;
    if (!player || !message) return;
    if (player.isDying && !player.deathComplete) return;
    this.pendingRespawn = null;
    player.teleport(message.x, message.y, message.z, message.rotationY);
  }

  private snapCameraIfPlaced(): void {
    const player = this.localPlayer;
    if (!player) return;
    const placement = player.consumePlacement();
    if (placement === 'none') return;
    this.camera.snapTo(player.position, placement === 'respawn');
  }

  private onPlayerAdded(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.add(sessionId, state);
    this.bloxity.playerJoined(sessionId);
    this.bloxity.playerInRoom(sessionId);
  }

  private onPlayerChanged(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.update(sessionId, state);
  }

  /** Everything the server says about the local player. It derives none of it. */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;
    this.local = state;

    player.setTongueLength(state.tongueLength);
    player.setCosmetics(state.trailSlot, state.tongueSlot, state.tongueLength);
    player.setDisplayName(state.displayName, state.avatarUrl);

    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        rotationY: state.rotationY,
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        velocityZ: state.velocityZ,
        grounded: state.grounded,
        lastInputSeq: state.lastInputSeq,
        tonguePhase: state.tonguePhase,
        tongueTime: state.tongueTime,
        tongueHit: state.tongueHit,
        tongueLatched: state.tongueLatched,
        tongueDrop: state.tongueDrop,
        tongueControl: state.tongueControl,
        tongueCount: state.tongueCount,
        tongueSX: state.tongueSX,
        tongueSY: state.tongueSY,
        tongueSZ: state.tongueSZ,
        tongueEX: state.tongueEX,
        tongueEY: state.tongueEY,
        tongueEZ: state.tongueEZ,
        tongueYaw0: state.tongueYaw0,
        tonguePitch0: state.tonguePitch0,
        tongueMax: state.tongueMax,
        tongueSeg: state.tongueSeg,
        tonguePath: state.tonguePath,
      });
    }

    this.hud.update(state.xp, state.tongueLength, state.rebirths);
    this.wins.update(state.wins);
    this.world.stage.setInventory(state.wins, state.ownedTongues, state.tongueSlot);
    this.world.training.setRebirths(state.rebirths);

    // A LEVEL-UP - not XP, and not the level drop of a rebirth - pops the popup.
    if (this.lastLevel >= 0 && state.level > this.lastLevel && state.rebirths === this.lastRebirths) {
      this.audio.play('level');
      this.levelUp.show(this.lastLevel, this.lastLength, state.level, state.tongueLength);
    }
    this.lastLength = state.tongueLength;
    if (this.lastRebirths >= 0 && state.rebirths > this.lastRebirths) this.audio.play('rebirth');
    this.lastLevel = state.level;
    this.lastRebirths = state.rebirths;

    this.rebirthPanel.setProgress(state.level, state.rebirths);
    this.rebirthButton.setState(this.rebirthPanel.isEligible, false);
    this.trailsPanel.setInventory(state.wins, state.ownedTrails, state.trailSlot);
    this.trailsButton.setState(this.trailsPanel.hasAffordable);
  }

  private onNotice(message: NoticeMessage): void {
    switch (message.kind) {
      case 'bought':
        this.audio.play('unlock');
        this.toasts.show(message.text, 'good');
        break;
      case 'equipped':
        this.audio.play('buy');
        this.toasts.show(message.text, 'good');
        break;
      case 'rebirth':
        this.toasts.show(message.text, 'gold');
        break;
      case 'refused':
      case 'locked':
        this.audio.play('refuse');
        this.toasts.show(message.text, 'bad');
        break;
    }
  }

  private onStageAwarded(message: StageAwardedMessage): void {
    const player = this.localPlayer;
    if (player) {
      this.world.winTrophies.follow(player.position);
      this.world.winTrophies.play(message.wins);
    }
    this.wins.update(message.total);
    this.audio.play('win');
    this.toasts.show(`+${formatWins(message.wins)} Win${message.wins === 1 ? '' : 's'}!`, 'gold');
    logger.info(SCOPE, `stage ${message.stageIndex} banked: +${message.wins} wins`);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.stop();
    this.hud.dispose();
    this.wins.dispose();
    this.hint.dispose();
    this.toasts.dispose();
    this.levelUp.dispose();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.bloxity.dispose();
    this.bloxityPanel.dispose();
    this.dresser?.dispose();
    this.fpsReadout.remove();
    this.audio.dispose();
    this.trailsButton.dispose();
    this.rebirthButton.dispose();
    this.audioButton.dispose();
    this.rebirthPanel.dispose();
    this.trailsPanel.dispose();
    this.rail.remove();
    this.remotePlayers.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
