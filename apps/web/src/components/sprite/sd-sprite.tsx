"use client";
/**
 * SD 스프라이트 + 코드 모션 (+ 선택: AI 포즈 이미지 교차 페이드).
 *  - idle: 항상 도는 숨쉬기. phase 로 유닛마다 박자를 어긋나게 한다.
 *  - 나머지 모션은 motionKey 가 바뀔 때마다 한 번 재생. 몸 전체 변형 + 잔상(공격·회피) + 이펙트(피격 섬광, 전투불능 먼지).
 *  - poses 에 해당 포즈 이미지가 있으면 모션 동안 대기 이미지 위에 교차 페이드로 겹친다 (전투불능은 유지).
 *  - flip: 왼쪽을 보게 뒤집는다(적). 모션의 "앞"은 항상 바라보는 방향이다.
 *  - height: 픽셀 수, 또는 "100%"(부모 높이에 맞춰 축소; 무대용).
 * 키프레임은 globals.css 의 .sd-* 참고.
 */
import type { CSSProperties } from "react";
import type { SpritePoses } from "@limbus/rules";
import type { SpriteMotion } from "./sprite-motion";
export { SPRITE_MOTIONS, type SpriteMotion } from "./sprite-motion";

/** 모션별 길이(ms). CSS 키프레임 길이와 맞춘다 */
const DUR: Record<SpriteMotion, number> = { idle: 0, ready: 450, attack: 650, evade: 500, hit: 550, down: 900, win: 900 };
const GHOSTED: SpriteMotion[] = ["attack", "evade"];

export function SdSprite({ src, poses, height, flip, motion = "idle", motionKey, phase = 0, className = "", style, alt = "", shadow = true }: {
  src: string; poses?: SpritePoses | null; height: number | string; flip?: boolean; motion?: SpriteMotion; motionKey?: string | number; phase?: number; className?: string; style?: CSSProperties; alt?: string; shadow?: boolean;
}) {
  const full = typeof height === "string";
  const h = full ? "h-full" : "";
  const imgH: CSSProperties = full ? { maxHeight: "100%" } : { height };
  const poseSrc = motion !== "idle" && motion !== "ready" && poses ? poses[motion] ?? null : null;
  const key = `${motion}:${motionKey ?? ""}`;
  const ghosts = GHOSTED.includes(motion);
  const imgCls = `block w-auto max-w-none object-contain ${shadow ? "drop-shadow-[0_8px_12px_rgba(0,0,0,.85)]" : ""}`;
  return (
    <span className={`sd-root ${h} ${flip ? "sd-flip" : ""} ${className}`} style={style}>
      <span className={`sd-idle ${h}`} style={{ animationDelay: `${-(phase * 1.3) % 2.8}s` }}>
        {/* 잔상: 몸이 움직이는 동안 제자리에 남는 반투명 복사본 (key 가 바뀌면 다시 재생) */}
        {ghosts ? [0, 1].map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${key}:g${i}`} src={src} alt="" aria-hidden draggable={false} className={`sd-ghost sd-ghost-${motion}`} style={{ ...imgH, animationDelay: `${i * 70}ms`, ["--sd-gi" as string]: i }} />
        )) : null}
        <span key={key} className={`sd-m ${h} ${motion !== "idle" ? `sd-m-${motion}` : ""}`} style={{ ["--sd-dur" as string]: `${DUR[motion]}ms` }}>
          <span className={`sd-stack relative block ${h}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} draggable={false} className={`sd-base ${imgCls} ${poseSrc ? (motion === "down" ? "sd-base-stay" : "sd-base-out") : ""}`} style={imgH} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {poseSrc ? <img src={poseSrc} alt="" aria-hidden draggable={false} className={`sd-pose ${imgCls} ${motion === "down" ? "sd-pose-stay" : "sd-pose-in"}`} style={imgH} /> : null}
          </span>
          {motion === "hit" ? <><span className="sd-fx sd-fx-burst" /><span className="sd-fx sd-fx-slash" /></> : null}
          {motion === "down" ? <span className="sd-fx sd-fx-dust" /> : null}
          {motion === "win" ? <span className="sd-fx sd-fx-shine" /> : null}
        </span>
      </span>
    </span>
  );
}
