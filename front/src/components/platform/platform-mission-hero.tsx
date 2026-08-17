import type { ReactNode } from "react";
import { formatBrl } from "@/lib/platform-license";

export function PlatformMissionHero({
    mrrBrl,
    activeOrgs,
    totalUsers,
    paidCount,
    action,
}: {
    mrrBrl: number;
    activeOrgs: number;
    totalUsers: number;
    paidCount: number;
    action?: ReactNode;
}) {
    return (
        <section className="platform-mission-hero relative overflow-hidden border-b border-violet-500/20">
            <div className="platform-mission-hero-bg absolute inset-0" aria-hidden />
            <div className="relative mx-auto flex max-w-[1600px] flex-col gap-8 px-5 py-10 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-14">
                <div className="min-w-0 space-y-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-600/70">
                        Mission Control · EngHub
                    </p>
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-widest text-slate-700/50">
                            MRR estimado
                        </p>
                        <p className="mt-1 text-5xl font-black tabular-nums tracking-tighter text-slate-950 sm:text-6xl lg:text-7xl">
                            {formatBrl(mrrBrl)}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-6 text-sm">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70">
                                Clientes pagantes
                            </p>
                            <p className="text-2xl font-black tabular-nums text-slate-900">{paidCount}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70">
                                Orgs ativas
                            </p>
                            <p className="text-2xl font-black tabular-nums text-slate-900">{activeOrgs}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70">
                                Usuários
                            </p>
                            <p className="text-2xl font-black tabular-nums text-slate-900">{totalUsers}</p>
                        </div>
                    </div>
                </div>
                {action ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
                ) : null}
            </div>
        </section>
    );
}
