import { notFound } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input, PageTitle } from "@/components/ui";
import { Panel } from "@/components/office/panel";

/** 사이트 틀 미리보기 (개발 전용, 프로덕션 404): 헤더는 로그인해야 보이므로 여기서는 같은 모양을 흉내 낸 띠를 함께 그린다 */
export default function DevShellPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="space-y-4">
      <header className="site-header -mx-4 -mt-6 mb-6">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <span className="logo">LIMBUS <b>TRPG</b></span>
          <nav className="flex items-center gap-1.5"><span className="nav-link">캠페인</span><span className="nav-link">내 캐릭터</span><span className="nav-link">룰북</span><span className="nav-link">데이터북</span><span className="nav-link">로그아웃</span></nav>
        </div>
      </header>
      <PageTitle right={<Button>새 캠페인</Button>}>해결사 사무소</PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="세션" stamp="LIVE" right={<Button variant="ghost" className="lb-btn-sm">새 세션</Button>}>
            <ul className="space-y-2">
              <li className="lb-card flex items-center justify-between gap-3 p-3"><div><div className="font-medium">3회차 · 뒷골목의 밤</div><div className="text-xs text-muted">2026-11-23 · 진행 중</div></div><Button className="lb-btn-sm">입장</Button></li>
              <li className="lb-card flex items-center justify-between gap-3 p-3"><div><div className="font-medium">2회차 · 검문소</div><div className="text-xs text-muted">2026-11-16 · 종료</div></div><Button variant="ghost" className="lb-btn-sm">기록</Button></li>
            </ul>
          </Panel>
          <Panel title="공지" stamp="NOTICE">
            <p className="text-sm">다음 세션은 토요일 저녁. 캐릭터 시트를 미리 손봐 두세요.</p>
            <div className="mt-3 flex gap-2"><Input placeholder="공지 내용" defaultValue="다음 세션은 토요일 저녁" /><Button>저장</Button></div>
          </Panel>
          <Panel title="내 캐릭터" stamp="SINNERS">
            <div className="grid gap-3 sm:grid-cols-2">
              {["테스트 해결사", "위자드 테스트"].map((n) => <Card key={n}><div className="font-title text-base">{n}</div><div className="mt-1 text-xs text-muted">레벨 <span className="font-num text-sm text-gold">3</span> · 체력 <span className="font-num text-sm">48</span>/<span className="font-num text-sm">60</span></div><div className="mt-2 flex gap-1"><Button className="lb-btn-sm">시트</Button><Button variant="ghost" className="lb-btn-sm">편집</Button><Button variant="danger" className="lb-btn-sm">삭제</Button></div></Card>)}
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="멤버" stamp="GM">
            <ul className="space-y-1 text-sm"><li className="flex justify-between"><span>djfls</span><span className="text-muted">GM</span></li><li className="flex justify-between"><span>친구 A</span><span className="text-muted">플레이어</span></li></ul>
            <div className="lb-divider my-3" />
            <Input placeholder="초대 코드" />
          </Panel>
          <Panel title="적 도감" stamp="ENEMY"><p className="text-sm text-muted">등록된 적 <span className="font-num text-base text-fg">12</span></p><Link href="#" className="lb-btn lb-btn-ghost lb-btn-sm mt-2">열기</Link></Panel>
        </div>
      </div>
    </div>
  );
}
