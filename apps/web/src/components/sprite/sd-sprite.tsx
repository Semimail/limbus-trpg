"use client";
/**
 * SD 스프라이트 + 코드 모션 (+ 선택: AI 포즈 이미지 교차 페이드, 프레임 띠 애니메이션).
 *  - idle: 항상 도는 숨쉬기. phase 로 유닛마다 박자를 어긋나게 한다. anims.idle 이 있으면 프레임 루프.
 *  - 나머지 모션은 motionKey 가 바뀔 때마다 한 번 재생. 몸 전체 변형 + 잔상(공격·회피) + 이펙트(피격 섬광, 전투불능 먼지).
 *  - anims[모션] 이 있으면 프레임을 순서대로 넘기고(전투불능은 마지막 프레임 유지), 없고 poses[모션] 이 있으면 교차 페이드, 둘 다 없으면 코드 모션만.
 *  - flip: 왼쪽을 보게 뒤집는다(적). 모션의 "앞"은 항상 바라보는 방향이다.
 *  - height: 픽셀 수, 또는 "100%"(부모 높이에 맞춰 축소; 무대용).
 * 키프레임은 globals.css 의 .sd-* 참고.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { SpritePoses, SpriteAnims, SpriteAnim } from "@limbus/rules";
import type { SpriteMotion } from "./sprite-motion";
export { SPRITE_MOTIONS, type SpriteMotion } from "./sprite-motion";

/** 모션별 길이(ms). CSS 키프레임 길이와 맞춘다 */
const DUR: Record<SpriteMotion, number> = { idle: 0, ready: 450, attack: 650, evade: 500, hit: 550, down: 900, win: 900 };
const GHOSTED: SpriteMotion[] = ["attack", "evade"];

/** 프레임 목록을 순서대로 보여준다. 모든 프레임은 같은 크기(slice.ts) 라 첫 프레임이 자리를 잡고 나머지는 겹친다 */
function StripPlayer({ anim, loop, holdLast, imgH, imgCls, alt }: { anim: SpriteAnim; loop: boolean; holdLast: boolean; imgH: CSSProperties; imgCls: string; alt: string }) {
  const [i, setI] = useState(0);
  const n = anim.frames.length;
  useEffect(() => {
    if (n <= 1) return;
    let idx = 0;
    const step = 1000 / (anim.fps ?? 6);
    const t = setInterval(() => {
      idx += 1;
      if (idx >= n) { if (loop) idx = 0; else { clearInterval(t); if (!holdLast) setI(0); return; } }
      setI(idx);
    }, step);
    return () => clearInterval(t);
  }, [anim, n, loop, holdLast]);
  return (
    <span className="sd-strip relative block">
      {anim.frames.map((f, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f} src={f} alt={k === 0 ? alt : ""} aria-hidden={k !== 0} draggable={false} className={`${imgCls} ${k === 0 ? "" : "absolute bottom-0 left-0"}`} style={{ ...imgH, opacity: k === i ? 1 : 0 }} />
      ))}
    </span>
  );
}

export function SdSprite({ src, poses, anims, animKey, height, flip, motion = "idle", motionKey, phase = 0, className = "", style, alt = "", shadow = true }: {
  src: string; poses?: SpritePoses | null; anims?: SpriteAnims | null; /** 우선 재생할 띠 키 (예: "skill:<id>"). 없으면 모션 이름의 띠 */ animKey?: string | null; height: number | string; flip?: boolean; motion?: SpriteMotion; motionKey?: string | number; phase?: number; className?: string; style?: CSSProperties; alt?: string; shadow?: boolean;
}) {
  const full = typeof height === "string";
  const h = full ? "h-full" : "";
  const imgH: CSSProperties = full ? { maxHeight: "100%" } : { height };
  const anim = anims ? ((animKey ? anims[animKey as keyof SpriteAnims] : null) ?? (motion !== "idle" && motion !== "ready" ? anims[motion] ?? null : null)) : null;
  const idleAnim = anims?.idle ?? null;
  const poseSrc = !anim && motion !== "idle" && motion !== "ready" && poses ? poses[motion] ?? null : null;
  const key = `${motion}:${motionKey ?? ""}`;
  const ghosts = GHOSTED.includes(motion);
  const imgCls = `block w-auto max-w-none object-contain ${shadow ? "drop-shadow-[0_8px_12px_rgba(0,0,0,.85)]" : ""}`;
  const ghostSrc = idleAnim?.frames[0] ?? src;
  return (
    <span className={`sd-root ${h} ${flip ? "sd-flip" : ""} ${className}`} style={style}>
      <span className={`sd-idle ${h}`} style={{ animationDelay: `${-(phase * 1.3) % 2.8}s` }}>
        {/* 잔상: 몸이 움직이는 동안 제자리에 남는 반투명 복사본 (key 가 바뀌면 다시 재생) */}
        {ghosts ? [0, 1].map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${key}:g${i}`} src={ghostSrc} alt="" aria-hidden draggable={false} className={`sd-ghost sd-ghost-${motion}`} style={{ ...imgH, animationDelay: `${i * 70}ms`, ["--sd-gi" as string]: i }} />
        )) : null}
        <span key={key} className={`sd-m ${h} ${motion !== "idle" ? `sd-m-${motion}` : ""}`} style={{ ["--sd-dur" as string]: `${DUR[motion]}ms` }}>
          {anim ? (
            <StripPlayer anim={anim} loop={false} holdLast={motion === "down"} imgH={imgH} imgCls={imgCls} alt={alt} />
          ) : (
            <span className={`sd-stack relative block ${h}`}>
              {idleAnim ? (
                <span className={`sd-base ${poseSrc ? (motion === "down" ? "sd-base-stay" : "sd-base-out") : ""}`}><StripPlayer anim={idleAnim} loop holdLast={false} imgH={imgH} imgCls={imgCls} alt={alt} /></span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={alt} draggable={false} className={`sd-base ${imgCls} ${poseSrc ? (motion === "down" ? "sd-base-stay" : "sd-base-out") : ""}`} style={imgH} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {poseSrc ? <img src={poseSrc} alt="" aria-hidden draggable={false} className={`sd-pose ${imgCls} ${motion === "down" ? "sd-pose-stay" : "sd-pose-in"}`} style={imgH} /> : null}
            </span>
          )}
          {motion === "hit" ? <><span className="sd-fx sd-fx-burst" /><span className="sd-fx sd-fx-slash" /></> : null}
          {motion === "down" ? <span className="sd-fx sd-fx-dust" /> : null}
          {motion === "win" ? <span className="sd-fx sd-fx-shine" /> : null}
        </span>
      </span>
    </span>
  );
}
