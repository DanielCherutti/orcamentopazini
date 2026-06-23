"use client";

import { useRef, useState } from "react";
import {
    lookupCepPlatformAction,
    lookupCnpjPlatformAction,
} from "@/actions/platform-lookup-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCep, maskCnpj, maskPhone } from "@/lib/br-input-masks";
import type { OrganizationCompanyFormValues } from "@/lib/organization-company";
import { Loader2 } from "lucide-react";

type Props = {
    values: OrganizationCompanyFormValues;
    onChange: (patch: Partial<OrganizationCompanyFormValues>) => void;
    disabled?: boolean;
    /** Sincroniza nome da org / slug quando CNPJ preenche razão social */
    onLegalNameResolved?: (name: string) => void;
};

export function OrganizationCompanyFields({
    values,
    onChange,
    disabled,
    onLegalNameResolved,
}: Props) {
    const [cnpjLoading, setCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState<string | null>(null);
    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const lastFetchedCnpjRef = useRef<string | null>(null);

    const busy = disabled || cnpjLoading || cepLoading;

    async function handleCnpjBlur() {
        const raw = values.cnpj.replace(/\D/g, "");
        if (raw.length !== 14) {
            lastFetchedCnpjRef.current = null;
            return;
        }
        if (lastFetchedCnpjRef.current === raw) return;

        setCnpjLoading(true);
        setCnpjError(null);
        try {
            const r = await lookupCnpjPlatformAction(raw);
            if (!r.success) {
                setCnpjError(r.error ?? "Não foi possível consultar o CNPJ.");
                lastFetchedCnpjRef.current = null;
                return;
            }
            onChange({
                legalName: r.name,
                cep: r.cnpj_cep ? maskCep(r.cnpj_cep) : values.cep,
                street: r.cnpj_logradouro || values.street,
                number: r.cnpj_numero || values.number,
                complement: r.cnpj_complemento || values.complement,
                neighborhood: r.cnpj_bairro || values.neighborhood,
                city: r.cnpj_municipio || values.city,
                state: r.cnpj_uf ? r.cnpj_uf.toUpperCase().slice(0, 2) : values.state,
            });
            onLegalNameResolved?.(r.name);
            lastFetchedCnpjRef.current = raw;
        } catch {
            setCnpjError("Consulta de CNPJ indisponível. Tente mais tarde.");
            lastFetchedCnpjRef.current = null;
        } finally {
            setCnpjLoading(false);
        }
    }

    async function handleCepBlur() {
        const cep = values.cep.replace(/\D/g, "");
        if (cep.length !== 8) return;

        setCepLoading(true);
        setCepError(null);
        try {
            const r = await lookupCepPlatformAction(cep);
            if (!r.success) {
                setCepError(r.error ?? "CEP não encontrado.");
                return;
            }
            onChange({
                street: r.street || values.street,
                neighborhood: r.neighborhood || values.neighborhood,
                city: r.city || values.city,
                state: r.state || values.state,
            });
        } catch {
            setCepError("Serviço de CEP indisponível.");
        } finally {
            setCepLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <h3 className="text-sm font-semibold">Dados da empresa</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="org-cnpj">CNPJ</Label>
                        <div className="relative">
                            <Input
                                id="org-cnpj"
                                value={values.cnpj}
                                onChange={(e) => {
                                    onChange({ cnpj: maskCnpj(e.target.value) });
                                    setCnpjError(null);
                                    if (e.target.value.replace(/\D/g, "").length !== 14) {
                                        lastFetchedCnpjRef.current = null;
                                    }
                                }}
                                onBlur={() => void handleCnpjBlur()}
                                placeholder="00.000.000/0000-00"
                                disabled={busy}
                                className="h-10"
                            />
                            {cnpjLoading && (
                                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                            )}
                        </div>
                        {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="org-ie">Inscrição estadual</Label>
                        <Input
                            id="org-ie"
                            value={values.ie}
                            onChange={(e) => onChange({ ie: e.target.value })}
                            placeholder="000.000.000-00"
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="org-legal-name">Razão social *</Label>
                        <Input
                            id="org-legal-name"
                            value={values.legalName}
                            onChange={(e) => onChange({ legalName: e.target.value })}
                            placeholder="Empresa Exemplo Ltda"
                            required
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-semibold">Endereço</h3>
                <div className="grid gap-4 sm:grid-cols-6">
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="org-cep">CEP</Label>
                        <div className="relative">
                            <Input
                                id="org-cep"
                                value={values.cep}
                                onChange={(e) => {
                                    onChange({ cep: maskCep(e.target.value) });
                                    setCepError(null);
                                }}
                                onBlur={() => void handleCepBlur()}
                                placeholder="00000-000"
                                disabled={busy}
                                className="h-10"
                            />
                            {cepLoading && (
                                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                            )}
                        </div>
                        {cepError && <p className="text-xs text-destructive">{cepError}</p>}
                    </div>
                    <div className="space-y-2 sm:col-span-4">
                        <Label htmlFor="org-street">Logradouro</Label>
                        <Input
                            id="org-street"
                            value={values.street}
                            onChange={(e) => onChange({ street: e.target.value })}
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                        <Label htmlFor="org-number">Número</Label>
                        <Input
                            id="org-number"
                            value={values.number}
                            onChange={(e) => onChange({ number: e.target.value })}
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="org-complement">Complemento</Label>
                        <Input
                            id="org-complement"
                            value={values.complement}
                            onChange={(e) => onChange({ complement: e.target.value })}
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-3">
                        <Label htmlFor="org-neighborhood">Bairro</Label>
                        <Input
                            id="org-neighborhood"
                            value={values.neighborhood}
                            onChange={(e) => onChange({ neighborhood: e.target.value })}
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-3">
                        <Label htmlFor="org-city">Cidade</Label>
                        <Input
                            id="org-city"
                            value={values.city}
                            onChange={(e) => onChange({ city: e.target.value })}
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                        <Label htmlFor="org-state">UF</Label>
                        <Input
                            id="org-state"
                            value={values.state}
                            onChange={(e) =>
                                onChange({ state: e.target.value.toUpperCase().slice(0, 2) })
                            }
                            maxLength={2}
                            disabled={busy}
                            className="h-10 uppercase"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-semibold">Responsável</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="org-contact-name">Nome do responsável</Label>
                        <Input
                            id="org-contact-name"
                            value={values.contactName}
                            onChange={(e) => onChange({ contactName: e.target.value })}
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="org-contact-phone">Telefone</Label>
                        <Input
                            id="org-contact-phone"
                            value={values.contactPhone}
                            onChange={(e) =>
                                onChange({ contactPhone: maskPhone(e.target.value) })
                            }
                            placeholder="(00) 00000-0000"
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="org-contact-email">E-mail</Label>
                        <Input
                            id="org-contact-email"
                            type="email"
                            value={values.contactEmail}
                            onChange={(e) => onChange({ contactEmail: e.target.value })}
                            placeholder="contato@empresa.com"
                            disabled={busy}
                            className="h-10"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
