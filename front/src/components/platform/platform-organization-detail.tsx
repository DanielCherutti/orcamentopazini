"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OrganizationListItem, PlatformOrgMember, PlatformOrganizationMetrics } from "@/actions/platform-actions";
import {
    updatePlatformOrganizationAction,
    updatePlatformOrganizationBrandingAction,
    updatePlatformOrganizationCompanyAction,
    updateTenantSubdomainAction,
    setCustomDomainAction,
    verifyCustomDomainAction,
} from "@/actions/platform-actions";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { AuditLogEntry } from "@/types/audit-types";
import type { PlatformCharge } from "@/types/billing-types";
import type { TenantBillingProfileView } from "@/actions/platform-billing-actions";
import { ImpersonateOrganizationDialog } from "@/components/platform/impersonate-organization-dialog";
import { AuditLogTable } from "@/components/platform/audit-log-table";
import { PlatformOrgBillingSection } from "@/components/platform/platform-org-billing-section";
import { PlatformOrgUsersSection } from "@/components/platform/platform-org-users-section";
import { OrganizationCompanyFields } from "@/components/platform/organization-company-fields";
import { getTenantPublicOrigin } from "@/lib/tenant-public-origin";
import { organizationCompanyFromTenant } from "@/lib/organization-company";
import { getAppTenantDomain } from "@/lib/tenant-host";
import { PlatformBrandPreview } from "@/components/platform/platform-brand-preview";
import { PlanBadge, UsageBar } from "@/components/platform/platform-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CreditCard, Globe, Loader2, Palette, Receipt, Save, ScrollText, Users, Building2 } from "lucide-react";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import { toast } from "@/lib/toast";
import type { TenantLicensePlan } from "@/types/tenant-types";

function ColorField({
    id,
    label,
    value,
    onChange,
    disabled,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex gap-2">
                <div className="relative shrink-0">
                    <Input
                        id={id}
                        type="color"
                        className="absolute inset-0 h-10 w-12 cursor-pointer opacity-0"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                    />
                    <div
                        className="h-10 w-12 rounded-lg border shadow-inner ring-1 ring-black/5"
                        style={{ backgroundColor: value }}
                    />
                </div>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className="h-10 font-mono text-sm"
                />
            </div>
        </div>
    );
}

type Props = {
    organization: OrganizationListItem & { branding: ProposalSettings | null };
    metrics?: PlatformOrganizationMetrics;
    members?: PlatformOrgMember[];
    billingProfile?: TenantBillingProfileView;
    charges?: PlatformCharge[];
    auditEntries?: AuditLogEntry[];
    auditTotal?: number;
};

export function PlatformOrganizationDetail({
    organization,
    metrics,
    members = [],
    billingProfile,
    charges = [],
    auditEntries = [],
    auditTotal = 0,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const { can } = usePlatformPermissions();
    const canWrite = can("orgs.write");
    const canBilling = can("billing.view");
    const canBillingWrite = can("billing.write");
    const canAudit = can("audit.view");
    const [tab, setTab] = useState("license");

    const [name, setName] = useState(organization.name);
    const [slug, setSlug] = useState(organization.slug);
    const [maxUsers, setMaxUsers] = useState(
        organization.max_users != null ? String(organization.max_users) : "",
    );
    const [licensePlan, setLicensePlan] = useState<TenantLicensePlan>(
        organization.license_plan ?? "standard",
    );
    const [licenseExpires, setLicenseExpires] = useState(
        organization.license_expires_at?.slice(0, 10) ?? "",
    );

    const branding = organization.branding;
    const [companyName, setCompanyName] = useState(branding?.company_name ?? organization.name);
    const [logoUrl, setLogoUrl] = useState(branding?.company_logo_url ?? "");
    const [primaryColor, setPrimaryColor] = useState(branding?.primary_color ?? "#1e3a5f");
    const [secondaryColor, setSecondaryColor] = useState(branding?.secondary_color ?? "#c9a227");
    const [appPublicUrl, setAppPublicUrl] = useState(branding?.app_public_url ?? "");
    const [subdomain, setSubdomain] = useState(organization.subdomain ?? organization.slug);
    const [customDomain, setCustomDomain] = useState(organization.custom_domain ?? "");
    const [company, setCompany] = useState(() => organizationCompanyFromTenant(organization));
    const tenantDomain = getAppTenantDomain();
    const publicOrigin = getTenantPublicOrigin({ ...organization, subdomain });

    function saveLicense(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await updatePlatformOrganizationAction({
                tenantId: organization.id,
                name,
                slug,
                max_users: maxUsers ? Number(maxUsers) : null,
                license_plan: licensePlan,
                license_expires_at: licenseExpires || null,
            });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao salvar");
                return;
            }
            toast.success("Licença atualizada");
            router.refresh();
        });
    }

    function saveCompany(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await updatePlatformOrganizationCompanyAction({
                tenantId: organization.id,
                company,
            });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao salvar cadastro");
                return;
            }
            setName(company.legalName);
            setCompanyName(company.legalName);
            toast.success("Cadastro da empresa salvo");
            router.refresh();
        });
    }

    function saveBranding(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await updatePlatformOrganizationBrandingAction(organization.id, {
                company_name: companyName,
                company_logo_url: logoUrl,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                app_public_url: appPublicUrl,
            });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao salvar customização");
                return;
            }
            toast.success("Identidade visual salva");
            router.refresh();
        });
    }

    const isActive = organization.active !== false;

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6 min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                    <PlanBadge plan={organization.license_plan} />
                    {isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 hover:bg-emerald-500/10 dark:text-emerald-400">
                            Ativa
                        </Badge>
                    ) : (
                        <Badge variant="destructive">Inativa</Badge>
                    )}
                    <span className="text-sm text-muted-foreground font-mono">{organization.slug}</span>
                    <ImpersonateOrganizationDialog tenantRef={organization.slug} orgName={organization.name} />
                </div>

                {metrics && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            { label: "Usuários", value: metrics.member_count },
                            { label: "Orçamentos", value: metrics.budget_count },
                            { label: "Clientes", value: metrics.client_count },
                        ].map((m) => (
                            <div key={m.label} className="rounded-lg border bg-card p-3">
                                <p className="text-xs text-muted-foreground">{m.label}</p>
                                <p className="text-xl font-semibold tabular-nums">{m.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                <Tabs value={tab} onValueChange={setTab} className="gap-4">
                    <TabsList variant="line" className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
                        <TabsTrigger
                            value="license"
                            className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            <CreditCard className="h-4 w-4" />
                            Licença
                        </TabsTrigger>
                        <TabsTrigger
                            value="company"
                            className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            <Building2 className="h-4 w-4" />
                            Empresa
                        </TabsTrigger>
                        <TabsTrigger
                            value="access"
                            className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            <Globe className="h-4 w-4" />
                            Acesso
                        </TabsTrigger>
                        <TabsTrigger
                            value="users"
                            className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            <Users className="h-4 w-4" />
                            Usuários
                        </TabsTrigger>
                        {canBilling && (
                            <TabsTrigger
                                value="billing"
                                className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                <Receipt className="h-4 w-4" />
                                Cobrança
                            </TabsTrigger>
                        )}
                        {canAudit && (
                            <TabsTrigger
                                value="audit"
                                className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                <ScrollText className="h-4 w-4" />
                                Auditoria
                            </TabsTrigger>
                        )}
                        <TabsTrigger
                            value="brand"
                            className="gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            <Palette className="h-4 w-4" />
                            Identidade visual
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="license" className="mt-2">
                        <Card className="border-border/70 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base">Licença e limites</CardTitle>
                                <CardDescription>
                                    Controle plano, validade e quantos usuários podem acessar esta
                                    organização.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="mb-6 rounded-xl border border-border/60 bg-muted/25 p-4">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        Uso atual
                                    </p>
                                    <UsageBar
                                        used={organization.member_count}
                                        max={organization.max_users}
                                    />
                                </div>
                                <form onSubmit={saveLicense} className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-name">Nome</Label>
                                        <Input
                                            id="edit-name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                            disabled={pending || !canWrite}
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-slug">Slug</Label>
                                        <Input
                                            id="edit-slug"
                                            value={slug}
                                            onChange={(e) => setSlug(e.target.value)}
                                            disabled={pending || !canWrite}
                                            className="h-10 font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-max-users">Limite de usuários</Label>
                                        <Input
                                            id="edit-max-users"
                                            type="number"
                                            min={1}
                                            value={maxUsers}
                                            onChange={(e) => setMaxUsers(e.target.value)}
                                            placeholder="Sem limite"
                                            disabled={pending || !canWrite}
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-plan">Plano</Label>
                                        <Select
                                            value={licensePlan}
                                            onValueChange={(v) =>
                                                setLicensePlan(v as TenantLicensePlan)
                                            }
                                            disabled={pending || !canWrite}
                                        >
                                            <SelectTrigger id="edit-plan" className="h-10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="trial">Trial</SelectItem>
                                                <SelectItem value="standard">Standard</SelectItem>
                                                <SelectItem value="professional">
                                                    Professional
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="edit-expires" className="flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                            Licença expira em
                                        </Label>
                                        <Input
                                            id="edit-expires"
                                            type="date"
                                            value={licenseExpires}
                                            onChange={(e) => setLicenseExpires(e.target.value)}
                                            disabled={pending || !canWrite}
                                            className="h-10 max-w-xs"
                                        />
                                    </div>
                                    <div className="sm:col-span-2 pt-2">
                                        <Button type="submit" disabled={pending || !canWrite}>
                                            {pending ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Salvando…
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="h-4 w-4" />
                                                    Salvar licença
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="company" className="mt-2">
                        <Card className="border-border/70 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base">Cadastro da empresa</CardTitle>
                                <CardDescription>
                                    CNPJ, endereço e contato do responsável. Consultas automáticas
                                    de CNPJ (Brasil API) e CEP (ViaCEP).
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={saveCompany} className="space-y-4">
                                    <OrganizationCompanyFields
                                        values={company}
                                        onChange={(patch) =>
                                            setCompany((prev) => ({ ...prev, ...patch }))
                                        }
                                        disabled={pending || !canWrite}
                                        onLegalNameResolved={(legalName) => setName(legalName)}
                                    />
                                    {canWrite && (
                                        <Button type="submit" disabled={pending}>
                                            {pending ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                <Save className="size-4" />
                                            )}
                                            Salvar cadastro
                                        </Button>
                                    )}
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="access" className="mt-2">
                        <Card className="border-border/70 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base">URL e domínio</CardTitle>
                                <CardDescription>
                                    Subdomínio da plataforma e domínio customizado (enterprise).
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                                    <p className="font-medium">URL pública</p>
                                    <p className="mt-1 font-mono text-violet-700 dark:text-violet-300">{publicOrigin}</p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Subdomínio</Label>
                                        <div className="flex gap-2">
                                            <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} className="font-mono" />
                                            <Button
                                                type="button"
                                                disabled={pending || !canWrite}
                                                onClick={() =>
                                                    startTransition(async () => {
                                                        const res = await updateTenantSubdomainAction(organization.slug, subdomain);
                                                        if (!res.success) toast.error(res.error ?? "Erro");
                                                        else toast.success("Subdomínio salvo");
                                                    })
                                                }
                                            >
                                                Salvar
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {subdomain}.{tenantDomain}
                                        </p>
                                    </div>
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label>Domínio customizado</Label>
                                        <div className="flex flex-wrap gap-2">
                                            <Input
                                                value={customDomain}
                                                onChange={(e) => setCustomDomain(e.target.value)}
                                                placeholder="portal.cliente.com.br"
                                                className="min-w-[200px] flex-1 font-mono"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={pending || !canWrite}
                                                onClick={() =>
                                                    startTransition(async () => {
                                                        const res = await setCustomDomainAction(organization.slug, customDomain);
                                                        if (!res.success) toast.error(res.error ?? "Erro");
                                                        else toast.success("Domínio cadastrado — configure DNS");
                                                    })
                                                }
                                            >
                                                Salvar
                                            </Button>
                                            <Button
                                                type="button"
                                                disabled={pending || !customDomain}
                                                onClick={() =>
                                                    startTransition(async () => {
                                                        const res = await verifyCustomDomainAction(organization.slug);
                                                        if (!res.success) toast.error(res.error ?? "Erro");
                                                        else if (res.verified) toast.success("DNS verificado");
                                                        else toast.error("CNAME ainda não aponta para o subdomínio");
                                                        router.refresh();
                                                    })
                                                }
                                            >
                                                Verificar DNS
                                            </Button>
                                        </div>
                                        {organization.custom_domain_verified_at ? (
                                            <p className="text-xs text-emerald-600">Verificado em {organization.custom_domain_verified_at.slice(0, 10)}</p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                CNAME: {customDomain || "portal.cliente.com"} → {subdomain}.{tenantDomain}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="users" className="mt-2 space-y-4">
                        <PlatformOrgUsersSection
                            tenantRef={organization.slug}
                            members={members}
                            canWrite={canWrite}
                        />
                    </TabsContent>

                    {canBilling && billingProfile && (
                        <TabsContent value="billing" className="mt-2">
                            <PlatformOrgBillingSection
                                tenantRef={organization.slug}
                                profile={billingProfile}
                                charges={charges}
                                canWrite={canBillingWrite}
                            />
                        </TabsContent>
                    )}

                    {canAudit && (
                        <TabsContent value="audit" className="mt-2">
                            <Card className="border-border/70 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-base">Auditoria desta organização</CardTitle>
                                    <CardDescription>
                                        Ações da plataforma e operacionais vinculadas a esta empresa.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <AuditLogTable entries={auditEntries} total={auditTotal} />
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}

                    <TabsContent value="brand" className="mt-2">
                        <Card className="border-border/70 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base">Identidade visual</CardTitle>
                                <CardDescription>
                                    Marca exibida no login, menu e propostas desta empresa.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={saveBranding} className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="brand-name">Nome exibido</Label>
                                        <Input
                                            id="brand-name"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            disabled={pending || !canWrite}
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="brand-logo">URL do logo</Label>
                                        <Input
                                            id="brand-logo"
                                            value={logoUrl}
                                            onChange={(e) => setLogoUrl(e.target.value)}
                                            placeholder="https://…"
                                            disabled={pending || !canWrite}
                                            className="h-10"
                                        />
                                    </div>
                                    <ColorField
                                        id="brand-primary"
                                        label="Cor primária"
                                        value={primaryColor}
                                        onChange={setPrimaryColor}
                                        disabled={pending || !canWrite}
                                    />
                                    <ColorField
                                        id="brand-secondary"
                                        label="Cor secundária"
                                        value={secondaryColor}
                                        onChange={setSecondaryColor}
                                        disabled={pending || !canWrite}
                                    />
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="brand-url">URL pública do app</Label>
                                        <Input
                                            id="brand-url"
                                            value={appPublicUrl}
                                            onChange={(e) => setAppPublicUrl(e.target.value)}
                                            placeholder="https://cliente.exemplo.com"
                                            disabled={pending || !canWrite}
                                            className="h-10"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Usada em convites por e-mail e links de proposta.
                                        </p>
                                    </div>
                                    <div className="sm:col-span-2 pt-2">
                                        <Button type="submit" disabled={pending || !canWrite}>
                                            {pending ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Salvando…
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="h-4 w-4" />
                                                    Salvar identidade
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <div className="xl:sticky xl:top-8 xl:self-start space-y-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                    Prévia ao vivo
                </p>
                <PlatformBrandPreview
                    companyName={companyName}
                    logoUrl={logoUrl || undefined}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                />
                <p className="text-xs text-muted-foreground px-1 leading-relaxed">
                    A prévia reflete as alterações antes de salvar. O tenant verá este tema após
                    login na organização.
                </p>
            </div>
        </div>
    );
}
