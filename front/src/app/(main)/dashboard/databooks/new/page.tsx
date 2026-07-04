import type { Metadata } from "next";
import { NewDatabookForm } from "../databook-forms";

export const metadata: Metadata = {
    title: "Novo DataBook",
};

export default function NewDatabookPage() {
    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Novo DataBook</h1>
            <NewDatabookForm />
        </div>
    );
}
