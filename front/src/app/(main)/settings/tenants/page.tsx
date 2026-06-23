import { redirect } from "next/navigation";

/** Legado: gestão de orgs migrou para /platform (admin da plataforma). */
export default function SettingsTenantsRedirectPage() {
    redirect("/platform/organizations");
}
