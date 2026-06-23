import { TENANT_APPEARANCE_STORAGE_KEY } from "@/lib/tenant-theme";

/** Evita flash de tema errado antes da hidratação do React. */
export function TenantThemeScript() {
    const script = `(function(){try{var k=${JSON.stringify(TENANT_APPEARANCE_STORAGE_KEY)};var v=localStorage.getItem(k);if(v==="light"||v==="dark"){document.documentElement.dataset.tenantTheme=v}}catch(e){}})();`;

    return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
