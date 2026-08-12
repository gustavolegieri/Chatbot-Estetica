import { BrainCircuit } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { AiOperationsPanel } from "@/components/admin/AiOperationsPanel";

export default function AiAutomationPage() {
  return <div className="pb-20"><AdminHeader title="Automações com IA" description="Inteligência transversal para WhatsApp, CRM, qualidade, PWA e crescimento." eyebrow="Operação zero-touch" icon={BrainCircuit} /><AiOperationsPanel /></div>;
}
