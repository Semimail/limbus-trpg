"use client";
/**
 * SD 스프라이트 + 코드 모션. 이미지는 한 장(대기 포즈)이고 움직임은 전부 CSS 키프레임.
 *  - idle: 항상 도는 숨쉬기. 나머지는 motionKey 가 바뀔 때마다 한 번 재생.
 *  - flip: 왼쪽을 보게 뒤집는다(적). 모션의 "앞"은 항상 바라보는 방향이다.
 *  - height: 픽셀 수, 또는 "100%"(부모 높이에 맞춰 축소; 무대용).
 * 키프레임은 globals.css 의 .sd-* 참고.
 */
import type { CSSProperties } from "react";
import type { SpriteMotion } from "./sprite-motion";
export { SPRITE_MOTIONS, type SpriteMotion } from "./sprite-motion";

export function SdSprite({ src, height, flip, motion = "idle", motionKey, className = "", style, alt = "", shadow = true }: {
  src: string; height: number | string; flip?: boolean; motion?: SpriteMotion; motionKey?: string | number; className?: string; style?: CSSProperties; alt?: string; shadow?: boolean;
}) {
  const full = typeof height === "string";
  const h = full ? "h-full" : "";
  return (
    <span className={`sd-root ${h} ${flip ? "sd-flip" : ""} ${className}`} style={style}>
      <span className={`sd-idle ${h}`}>
        {/* key 가 바뀌면 요소가 새로 만들어져 애니메이션이 처음부터 다시 돈다 */}
        <span key={`${motion}:${motionKey ?? ""}`} className={`sd-m ${h} ${motion !== "idle" ? `sd-m-${motion}` : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} draggable={false} className={`block w-auto max-w-none object-contain ${full ? "max-h-full" : ""} ${shadow ? "drop-shadow-[0_8px_12px_rgba(0,0,0,.85)]" : ""}`} style={full ? undefined : { height }} />
        </span>
      </span>
    </span>
  );
}
