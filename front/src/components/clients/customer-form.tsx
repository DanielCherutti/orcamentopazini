"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { CustomerFull, CustomerFormInput } from "@/actions/client-actions";
import { lookupCnpjAction } from "@/actions/client-actions";

// ─── Mask helpers ────────────────────────────────────────────────────────────

function maskCnpj(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 14);
    return d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskPhone(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 10) {
        return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/\($/, "");
    }
    return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.replace(/^(\d{5})(\d{0,3})/, "$1-$2").replace(/-$/, "");
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const formSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    cnpj: z.string().optional(),
    stateRegistration: z.string().optional(),
    contact: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("E-mail inválido").optional().or(z.literal("")),
    address: z.object({
        cep: z.string().optional(),
        street: z.string().optional(),
        number: z.string().optional(),
        complement: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
    }).optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Props ───────────────────────────────────────────────────────────────────

interface CustomerFormProps {
    initialData?: CustomerFull;
    onSubmit: (data: CustomerFormInput) => Promise<void>;
    onDelete?: () => Promise<void>;
    isSubmitting?: boolean;
    fieldErrors?: Record<string, string[] | undefined>;
    generalError?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CustomerForm({
    initialData,
    onSubmit,
    onDelete,
    isSubmitting,
    fieldErrors,
    generalError,
}: CustomerFormProps) {
    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const [cnpjLoading, setCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState<string | null>(null);
    const lastFetchedCnpjRef = useRef<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const {
        register,
        handleSubmit,
        setValue,
        getValues,
        setFocus,
        formState: { errors, isSubmitting: formSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: initialData?.name ?? "",
            cnpj: initialData?.cnpj ?? "",
            stateRegistration: initialData?.stateRegistration ?? "",
            contact: initialData?.contact ?? "",
            phone: initialData?.phone ?? "",
            email: initialData?.email ?? "",
            address: {
                cep: initialData?.address?.cep ?? "",
                street: initialData?.address?.street ?? "",
                number: initialData?.address?.number ?? "",
                complement: initialData?.address?.complement ?? "",
                neighborhood: initialData?.address?.neighborhood ?? "",
                city: initialData?.address?.city ?? "",
                state: initialData?.address?.state ?? "",
            },
        },
    });

    const busy = isSubmitting || formSubmitting || isDeleting;
    const cnpjFieldReg = register("cnpj");

    const handleCnpjBlur = async () => {
        const raw = getValues("cnpj")?.replace(/\D/g, "") ?? "";
        if (raw.length !== 14) {
            lastFetchedCnpjRef.current = null;
            return;
        }
        if (lastFetchedCnpjRef.current === raw) return;

        setCnpjLoading(true);
        setCnpjError(null);

        try {
            const r = await lookupCnpjAction(raw);
            if (r.success && r.name) {
                setValue("name", r.name, { shouldValidate: true, shouldDirty: true });
                lastFetchedCnpjRef.current = raw;
                setFocus("name");
                setCnpjError(null);
            } else {
                setCnpjError(r.error ?? "Não foi possível consultar o CNPJ.");
                lastFetchedCnpjRef.current = null;
            }
        } catch {
            setCnpjError("Consulta de CNPJ indisponível. Tente mais tarde.");
            lastFetchedCnpjRef.current = null;
        } finally {
            setCnpjLoading(false);
        }
    };

    const handleCepBlur = async () => {
        const cep = getValues("address.cep")?.replace(/\D/g, "");
        if (!cep || cep.length !== 8) return;
        setCepLoading(true);
        setCepError(null);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
                signal: controller.signal,
            });
            const data = await res.json();
            if (data.erro) {
                setCepError("CEP não encontrado. Preencha o endereço manualmente.");
            } else {
                setValue("address.street", data.logradouro || "");
                setValue("address.complement", data.complemento || "");
                setValue("address.neighborhood", data.bairro || "");
                setValue("address.city", data.localidade || "");
                setValue("address.state", data.uf || "");
                setFocus("address.number");
                setCepError(null);
            }
        } catch {
            setCepError("Serviço de CEP indisponível. Preencha o endereço manualmente.");
        } finally {
            clearTimeout(timeout);
            setCepLoading(false);
        }
    };

    const handleFormSubmit = async (values: FormValues) => {
        await onSubmit(values as CustomerFormInput);
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        setIsDeleting(true);
        try {
            await onDelete();
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
            {/* General error */}
            {generalError && (
                <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {generalError}
                </div>
            )}

            {/* ── Dados da Empresa ── */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
                <h2 className="text-base font-semibold tracking-tight">Dados da Empresa</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CNPJ */}
                    <div className="space-y-1.5">
                        <Label htmlFor="cnpj">CNPJ</Label>
                        <div className="relative">
                            <Input
                                id="cnpj"
                                name={cnpjFieldReg.name}
                                ref={cnpjFieldReg.ref}
                                onBlur={(e) => {
                                    cnpjFieldReg.onBlur(e);
                                    void handleCnpjBlur();
                                }}
                                placeholder="00.000.000/0000-00"
                                disabled={busy || cnpjLoading}
                                className="rounded-sm"
                                onChange={(e) => {
                                    cnpjFieldReg.onChange(e);
                                    const masked = maskCnpj(e.target.value);
                                    setValue("cnpj", masked, {
                                        shouldValidate: true,
                                        shouldDirty: true,
                                    });
                                    setCnpjError(null);
                                    if (masked.replace(/\D/g, "").length !== 14) {
                                        lastFetchedCnpjRef.current = null;
                                    }
                                }}
                            />
                            {cnpjLoading && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                </div>
                            )}
                        </div>
                        {cnpjError && (
                            <p className="text-xs text-destructive">{cnpjError}</p>
                        )}
                        {(errors.cnpj?.message || fieldErrors?.cnpj?.[0]) && (
                            <p className="text-xs text-destructive">
                                {errors.cnpj?.message || fieldErrors?.cnpj?.[0]}
                            </p>
                        )}
                    </div>

                    {/* Inscrição Estadual */}
                    <div className="space-y-1.5">
                        <Label htmlFor="stateRegistration">Inscrição Estadual</Label>
                        <Input
                            id="stateRegistration"
                            {...register("stateRegistration")}
                            placeholder="000.000.000-00"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Nome */}
                    <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="name">Nome / Razão Social *</Label>
                        <Input
                            id="name"
                            {...register("name")}
                            placeholder="Empresa Exemplo Ltda"
                            disabled={busy}
                            className="rounded-sm"
                        />
                        {(errors.name?.message || fieldErrors?.name?.[0]) && (
                            <p className="text-xs text-destructive">
                                {errors.name?.message || fieldErrors?.name?.[0]}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Contato ── */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
                <h2 className="text-base font-semibold tracking-tight">Contato</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Responsável */}
                    <div className="space-y-1.5">
                        <Label htmlFor="contact">Responsável / Contato</Label>
                        <Input
                            id="contact"
                            {...register("contact")}
                            placeholder="João Silva"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Telefone */}
                    <div className="space-y-1.5">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                            id="phone"
                            {...register("phone")}
                            placeholder="(42) 99999-9999"
                            disabled={busy}
                            className="rounded-sm"
                            onChange={(e) => {
                                const masked = maskPhone(e.target.value);
                                setValue("phone", masked);
                            }}
                        />
                    </div>

                    {/* E-mail */}
                    <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="email">E-mail</Label>
                        <Input
                            id="email"
                            type="email"
                            {...register("email")}
                            placeholder="contato@empresa.com.br"
                            disabled={busy}
                            className="rounded-sm"
                        />
                        {(errors.email?.message || fieldErrors?.email?.[0]) && (
                            <p className="text-xs text-destructive">
                                {errors.email?.message || fieldErrors?.email?.[0]}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Endereço ── */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
                <h2 className="text-base font-semibold tracking-tight">Endereço</h2>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    {/* CEP */}
                    <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="address.cep">CEP</Label>
                        <div className="relative">
                            <Input
                                id="address.cep"
                                {...register("address.cep")}
                                placeholder="00000-000"
                                disabled={busy || cepLoading}
                                className="rounded-sm"
                                onChange={(e) => {
                                    const masked = maskCep(e.target.value);
                                    setValue("address.cep", masked);
                                }}
                                onBlur={handleCepBlur}
                            />
                            {cepLoading && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                </div>
                            )}
                        </div>
                        {cepError && <p className="text-xs text-destructive">{cepError}</p>}
                    </div>

                    {/* Logradouro */}
                    <div className="md:col-span-4 space-y-1.5">
                        <Label htmlFor="address.street">Logradouro</Label>
                        <Input
                            id="address.street"
                            {...register("address.street")}
                            placeholder="Rua Exemplo"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Número */}
                    <div className="md:col-span-1 space-y-1.5">
                        <Label htmlFor="address.number">Número</Label>
                        <Input
                            id="address.number"
                            {...register("address.number")}
                            placeholder="123"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Complemento */}
                    <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="address.complement">Complemento</Label>
                        <Input
                            id="address.complement"
                            {...register("address.complement")}
                            placeholder="Sala 10"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Bairro */}
                    <div className="md:col-span-3 space-y-1.5">
                        <Label htmlFor="address.neighborhood">Bairro</Label>
                        <Input
                            id="address.neighborhood"
                            {...register("address.neighborhood")}
                            placeholder="Centro"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Cidade */}
                    <div className="md:col-span-3 space-y-1.5">
                        <Label htmlFor="address.city">Cidade</Label>
                        <Input
                            id="address.city"
                            {...register("address.city")}
                            placeholder="Ponta Grossa"
                            disabled={busy}
                            className="rounded-sm"
                        />
                    </div>

                    {/* Estado */}
                    <div className="md:col-span-1 space-y-1.5">
                        <Label htmlFor="address.state">UF</Label>
                        <Input
                            id="address.state"
                            {...register("address.state")}
                            placeholder="PR"
                            maxLength={2}
                            disabled={busy}
                            className="rounded-sm uppercase"
                            onChange={(e) => {
                                setValue("address.state", e.target.value.toUpperCase());
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Actions ── */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    {initialData?.id && onDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    className="rounded-sm"
                                    disabled={busy}
                                >
                                    Excluir Cliente
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tem certeza que deseja excluir <strong>{initialData.name}</strong>? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={handleDelete}
                                    >
                                        Excluir
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>

                <Button
                    type="submit"
                    disabled={busy}
                    className="rounded-sm min-w-[140px]"
                >
                    {busy && !isDeleting ? (
                        <span className="flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                            Salvando...
                        </span>
                    ) : (
                        initialData?.id ? "Salvar Alterações" : "Criar Cliente"
                    )}
                </Button>
            </div>
        </form>
    );
}
