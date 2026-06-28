export type SfxId =
  | 'place'
  | 'rotate'
  | 'remove'
  | 'release'
  | 'collapse'
  | 'flood'
  | 'win'
  | 'frugal'
  | 'insufficient';

/** 音频总线抽象。本期占位静音，后期接素材不改调用方。 */
export interface AudioBus {
  playSfx(id: SfxId): void;
  playBgm(id: 'level' | null): void;
  setMuted(muted: boolean): void;
}

export function createAudio(): AudioBus {
  let muted = false;
  return {
    playSfx() {
      /* 占位静音 */
    },
    playBgm() {
      /* 占位静音 */
    },
    setMuted(m: boolean) {
      muted = m;
      void muted;
    },
  };
}
