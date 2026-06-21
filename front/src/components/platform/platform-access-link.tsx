"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { hasPlatformAccessAction, switchToPlatformAndRedirectAction } from "@/actions/login-routing-actions";
import { Button } from "@/components/ui/button";

export function PlatformAccessLink() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        void hasPlatformAccessAction().then(setVisible);
    }, []);

    if (!visible) return null;

    return (
        <form action={switchToPlatformAndRedirectAction}>
            <Button type="submit" variant="outline" size="sm" className="gap-2">
                <Shield className="h-4 w-4 text-violet-600" />
                Plataforma
            </Button>
        </form>
    );
}
