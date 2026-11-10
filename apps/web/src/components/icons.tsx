/* 림버스 이미지 아이콘. public/assets/limbus 아래 파일을 쓴다. */
import type { DamageType, DefenseKind, Sin, StatusId } from "@limbus/rules";
import { SIN_LABEL, DAMAGE_TYPE_LABEL, STATUS_LABEL } from "@limbus/rules";

const BASE = "/assets/limbus";

type ImgProps = { size?: number; className?: string; title?: string };

function Img({ src, alt, size = 20, className = "", title }: ImgProps & { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} title={title ?? alt} width={size} height={size} className={`inline-block align-middle ${className}`} draggable={false} />;
}

export function SinIcon({ sin, ...p }: ImgProps & { sin: Sin }) {
  return <Img src={`${BASE}/sins/${sin}.png`} alt={SIN_LABEL[sin]} {...p} />;
}

export function DamageIcon({ type, ...p }: ImgProps & { type: DamageType }) {
  return <Img src={`${BASE}/attack/${type}.png`} alt={DAMAGE_TYPE_LABEL[type]} {...p} />;
}

const DEFENSE_LABEL: Record<DefenseKind, string> = { guard: "가드", evade: "회피", counter: "반격" };
export function DefenseIcon({ kind, ...p }: ImgProps & { kind: DefenseKind }) {
  return <Img src={`${BASE}/attack/${kind}.png`} alt={DEFENSE_LABEL[kind]} {...p} />;
}

export function StatusIcon({ status, ...p }: ImgProps & { status: StatusId }) {
  return <Img src={`${BASE}/status/${status}.png`} alt={STATUS_LABEL[status]} {...p} />;
}

export function CoinIcon({ heads, ...p }: ImgProps & { heads: boolean }) {
  return <Img src={`${BASE}/coins/${heads ? "front" : "back"}.png`} alt={heads ? "앞면" : "뒷면"} className={heads ? "" : "opacity-60 grayscale"} {...p} />;
}

/** 상태 뱃지: 아이콘 + 숫자 */
export function StatusBadge({ status, value, size = 18 }: { status: StatusId; value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-sm border border-border bg-elev/80 px-1 text-xs tabular-nums" title={`${STATUS_LABEL[status]} ${value}`}>
      <StatusIcon status={status} size={size} />{value}
    </span>
  );
}

export const BACKGROUNDS = {
  backstreet: `${BASE}/bg/backstreet.jpg`,
  backstreetSm: `${BASE}/bg/backstreet-sm.jpg`,
} as const;
