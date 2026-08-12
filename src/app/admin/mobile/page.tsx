"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellRing,
  Bot,
  BrainCircuit,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  ContactRound,
  Headphones,
  Info,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  MoreVertical,
  PanelLeft,
  Pause,
  RefreshCw,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { WhatsAppChatThread, type ChatMessage } from "@/components/atendimento/WhatsAppChatThread";
import { AiOperationsPanel } from "@/components/admin/AiOperationsPanel";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { cn, formatPhone } from "@/lib/utils";
import { todayIsoLocal } from "@/lib/date-br";

type TabId = "chats" | "agenda" | "contacts" | "ai" | "campaigns" | "settings";

interface Conversation {
  id: string;
  phone: string;
  clientName: string;
  handoffStatus: string;
  botPaused: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  flowStageLabel: string;
  serviceLabel?: string;
  vehicleRaw?: string;
  ai?: { leadScore: number; urgency: string; sentiment: string; nextAction: string; needsHuman: boolean } | null;
}

interface ConversationDetail {
  session: {
    id: string;
    phone: string;
    handoffStatus: string;
    handoffReason: string | null;
    handoffNote: string | null;
    botPaused: boolean;
    client: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      vehicleModel: string | null;
      vehiclePlate: string | null;
      address: string | null;
      notes: string | null;
    } | null;
  };
  flow: {
    stageLabel: string;
    customerName?: string;
    serviceLabel?: string;
    vehicleRaw?: string;
    dayLabel?: string;
    startTime?: string;
    aiIntelligence?: { leadScore: number; urgency: string; sentiment: string; nextAction: string; summary: string; confidence: number; needsHuman: boolean };
  };
  messages: ChatMessage[];
  appointments: Appointment[];
}

interface Appointment {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
  status: string;
  notes?: string | null;
  client?: { id: string; name: string; phone?: string; vehicleModel?: string | null };
  service: { id?: string; name: string; durationMin?: number };
}

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  address: string | null;
  _count?: { appointments: number };
}

interface SyncedContact {
  id: string;
  phone: string;
  displayName: string;
  profileUrl: string | null;
  about: string | null;
  marketingConsent: boolean;
  hasConversation: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  crmClient: { id: string; name: string; vehicleModel: string | null; _count: { appointments: number } } | null;
}

interface CampaignItem {
  id: string;
  name: string;
  message: string;
  status: string;
  totalRecipients: number | null;
  successCount: number;
  failCount: number;
  createdAt: string;
}

interface ServiceItem { id: string; name: string }

const emptyCampaignForm = {
  name: "",
  message: "Olá {name}! Temos novidades para cuidar do seu veículo. Responda esta mensagem para saber mais ou agendar.",
  type: "advanced" as "all" | "inactive" | "service" | "advanced",
  days: 30,
  serviceId: "",
  authorizedOnly: true,
  neighborhood: "",
  vehicle: "",
  unreadOnly: false,
  handoffOnly: false,
  appointmentStatus: "any" as "any" | "scheduled" | "completed" | "none",
  interactedWithinDays: 90,
  confirmedAuthorized: false,
};

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em serviço",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-400/10 text-amber-300",
  CONFIRMED: "bg-sky-400/10 text-sky-300",
  IN_PROGRESS: "bg-brand-400/10 text-brand-300",
  COMPLETED: "bg-emerald-400/10 text-emerald-300",
  CANCELLED: "bg-red-400/10 text-red-300",
  NO_SHOW: "bg-slate-400/10 text-slate-400",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
}

function relativeMessageTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Avatar({ name, photoUrl, size = "md", online = false }: { name: string; photoUrl?: string | null; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const sizes = size === "lg" ? "h-20 w-20 text-xl" : size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm";
  return (
    <span className="relative shrink-0">
      <span
        className={cn("flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-700 to-[#183d2d] font-bold text-brand-100 ring-1 ring-white/10", sizes)}
        style={photoUrl ? { backgroundImage: `url(${JSON.stringify(photoUrl).slice(1, -1)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
      >
        {!photoUrl && initials(name)}
      </span>
      {online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0b1712] bg-emerald-400" />}
    </span>
  );
}

async function showClientNotification(conversation: Conversation) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: "SHOW_NOTIFICATION",
    title: conversation.clientName,
    body: conversation.lastMessagePreview || "Nova mensagem no WhatsApp",
    tag: `conversation-${conversation.phone}`,
    url: `/admin/mobile?phone=${encodeURIComponent(conversation.phone)}`,
  });
}

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export default function MobileAdminPage() {
  const [tab, setTab] = useState<TabId>("chats");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [syncedContacts, setSyncedContacts] = useState<SyncedContact[]>([]);
  const [contactsSyncedAt, setContactsSyncedAt] = useState<string | null>(null);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [importingContactNames, setImportingContactNames] = useState(false);
  const [contactNameFeedback, setContactNameFeedback] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [campaignPreview, setCampaignPreview] = useState<number | null>(null);
  const [campaignFeedback, setCampaignFeedback] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "handoff">("all");
  const [agendaDate, setAgendaDate] = useState(todayIsoLocal());
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [online, setOnline] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const previousMessages = useRef<Map<string, string | null>>(new Map());
  const initialConversationLoad = useRef(true);
  const contactFileInput = useRef<HTMLInputElement | null>(null);

  const checkedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    if (response.status === 401) setAuthExpired(true);
    return response;
  }, []);

  const syncPushSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const configResponse = await checkedFetch("/api/pwa/push", { cache: "no-store" });
    const config = await configResponse.json().catch(() => null);
    if (!config?.success || !config.data?.publicKey) return false;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(config.data.publicKey),
      });
    }
    const serialized = subscription.toJSON();
    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) return false;
    const response = await checkedFetch("/api/pwa/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: serialized.endpoint, keys: serialized.keys }),
    });
    return response.ok;
  }, [checkedFetch]);

  const loadConversations = useCallback(async (silent = false) => {
    const params = new URLSearchParams({ filter: chatFilter });
    if (tab === "chats" && search.trim()) params.set("q", search.trim());
    const response = await checkedFetch(`/api/atendimento/conversas?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!payload?.success) return;
    const next = payload.data as Conversation[];
    if (!initialConversationLoad.current && silent) {
      for (const item of next) {
        const previous = previousMessages.current.get(item.phone);
        if (previous && item.lastMessageAt && previous !== item.lastMessageAt && item.unreadCount > 0 && item.phone !== selectedPhone) {
          void showClientNotification(item);
        }
      }
    }
    previousMessages.current = new Map(next.map((item) => [item.phone, item.lastMessageAt]));
    initialConversationLoad.current = false;
    setConversations(next);
  }, [chatFilter, checkedFetch, search, selectedPhone, tab]);

  const loadAgenda = useCallback(async () => {
    const response = await checkedFetch(`/api/agendamentos?date=${agendaDate}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.success) setAppointments(payload.data);
  }, [agendaDate, checkedFetch]);

  const loadClients = useCallback(async () => {
    const response = await checkedFetch("/api/clientes", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.success) setClients(payload.data);
  }, [checkedFetch]);

  const loadSyncedContacts = useCallback(async (force = false) => {
    if (force) setSyncingContacts(true);
    try {
      const response = await checkedFetch(`/api/wasender/contacts${force ? "?refresh=true" : ""}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (payload?.success || payload?.data?.contacts) {
        setSyncedContacts(payload.data.contacts || []);
        setContactsSyncedAt(payload.data.lastSyncedAt || new Date().toISOString());
      }
    } finally {
      setSyncingContacts(false);
    }
  }, [checkedFetch]);

  const saveImportedContactNames = useCallback(async (contacts: Array<{ name: string; phone: string }>) => {
    if (!contacts.length) {
      setContactNameFeedback("Nenhum nome e telefone foram encontrados.");
      return;
    }
    setImportingContactNames(true);
    try {
      const response = await checkedFetch("/api/wasender/contacts/names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.success) throw new Error(payload?.error || "Falha ao importar nomes");
      setContactNameFeedback(`${payload.data.matched} nome(s) associado(s) aos contatos desta sessão.`);
      await loadSyncedContacts();
    } catch (error) {
      setContactNameFeedback(error instanceof Error ? error.message : "Não foi possível importar os nomes.");
    } finally {
      setImportingContactNames(false);
    }
  }, [checkedFetch, loadSyncedContacts]);

  const importNamesFromDevice = useCallback(async () => {
    const contactNavigator = navigator as Navigator & {
      contacts?: {
        select: (properties: Array<"name" | "tel">, options: { multiple: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
      };
    };
    if (!contactNavigator.contacts?.select) {
      contactFileInput.current?.click();
      return;
    }
    try {
      const selected = await contactNavigator.contacts.select(["name", "tel"], { multiple: true });
      const contacts = selected.flatMap((contact) => {
        const name = contact.name?.[0]?.trim();
        return name ? (contact.tel || []).map((phone) => ({ name, phone })) : [];
      });
      await saveImportedContactNames(contacts);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setContactNameFeedback("O celular não liberou o acesso aos contatos.");
    }
  }, [saveImportedContactNames]);

  const importNamesFromVcard = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const contacts = text.split(/END:VCARD/i).flatMap((card) => {
      const unfolded = card.replace(/\r?\n[ \t]/g, "");
      const name = unfolded.match(/(?:^|\r?\n)FN(?:;[^:]*)?:(.+)/i)?.[1]?.trim();
      const phones = [...unfolded.matchAll(/(?:^|\r?\n)TEL(?:;[^:]*)?:(.+)/gi)].map((match) => match[1].trim());
      return name ? phones.map((phone) => ({ name, phone })) : [];
    });
    await saveImportedContactNames(contacts);
  }, [saveImportedContactNames]);

  const loadCampaigns = useCallback(async () => {
    const [campaignResponse, serviceResponse] = await Promise.all([
      checkedFetch("/api/campanhas", { cache: "no-store" }),
      checkedFetch("/api/servicos?active=true", { cache: "no-store" }),
    ]);
    const [campaignPayload, servicePayload] = await Promise.all([
      campaignResponse.json().catch(() => null),
      serviceResponse.json().catch(() => null),
    ]);
    if (campaignPayload?.success) setCampaigns(campaignPayload.data || []);
    if (servicePayload?.success) setServices(servicePayload.data || []);
  }, [checkedFetch]);

  const loadDetail = useCallback(async (phone: string, showLoader = true) => {
    if (showLoader) setDetailLoading(true);
    try {
      const response = await checkedFetch(`/api/atendimento/conversas/${encodeURIComponent(phone)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (payload?.success) setDetail(payload.data);
    } finally {
      if (showLoader) setDetailLoading(false);
    }
  }, [checkedFetch]);

  const loadProfilePhoto = useCallback(async (phone: string) => {
    setProfilePhoto(null);
    const response = await checkedFetch(`/api/atendimento/contato/${encodeURIComponent(phone)}/foto`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.success) setProfilePhoto(payload.data.url ?? null);
  }, [checkedFetch]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    const params = new URLSearchParams(window.location.search);
    const phone = params.get("phone");
    const requestedTab = params.get("tab");
    if (phone) setSelectedPhone(phone);
    if (requestedTab && ["chats", "agenda", "contacts", "ai", "campaigns", "settings"].includes(requestedTab)) setTab(requestedTab as TabId);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, []);

  useEffect(() => {
    if (notificationPermission === "granted") void syncPushSubscription();
  }, [notificationPermission, syncPushSubscription]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadConversations(), loadAgenda(), loadClients(), loadSyncedContacts(), loadCampaigns()]).finally(() => setLoading(false));
  }, [loadAgenda, loadCampaigns, loadClients, loadConversations, loadSyncedContacts]);

  useEffect(() => {
    if (!selectedPhone) return;
    void Promise.all([loadDetail(selectedPhone), loadProfilePhoto(selectedPhone)]);
    const timer = window.setInterval(() => void loadDetail(selectedPhone, false), 4_000);
    return () => window.clearInterval(timer);
  }, [loadDetail, loadProfilePhoto, selectedPhone]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (navigator.onLine) void loadConversations(true);
    }, document.visibilityState === "visible" ? 7_000 : 20_000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (tab !== "campaigns") return;
    const timer = window.setTimeout(async () => {
      const selector = {
        type: campaignForm.type,
        days: campaignForm.days,
        serviceId: campaignForm.serviceId || undefined,
        authorizedOnly: campaignForm.authorizedOnly,
        neighborhood: campaignForm.neighborhood || undefined,
        vehicle: campaignForm.vehicle || undefined,
        unreadOnly: campaignForm.unreadOnly,
        handoffOnly: campaignForm.handoffOnly,
        appointmentStatus: campaignForm.appointmentStatus,
        interactedWithinDays: campaignForm.interactedWithinDays,
      };
      const response = await checkedFetch("/api/campanhas/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selector),
      });
      const payload = await response.json().catch(() => null);
      setCampaignPreview(payload?.success ? payload.data.recipients : null);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [campaignForm, checkedFetch, tab]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return syncedContacts;
    return syncedContacts.filter((contact) => [contact.displayName, contact.phone, contact.about, contact.crmClient?.vehicleModel].some((value) => value?.toLowerCase().includes(term)));
  }, [search, syncedContacts]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadConversations(), loadAgenda(), loadClients(), loadSyncedContacts(), loadCampaigns(), selectedPhone ? loadDetail(selectedPhone, false) : Promise.resolve()]);
    setRefreshing(false);
  }

  async function openChat(phone: string) {
    if (!conversations.some((conversation) => conversation.phone === phone)) {
      const response = await checkedFetch(`/api/wasender/contacts/${encodeURIComponent(phone)}/conversation`, { method: "POST" });
      if (!response.ok) return;
      await loadConversations();
    }
    setTab("chats");
    setSelectedPhone(phone);
    setDetail(null);
    setShowContact(false);
    window.history.replaceState({}, "", `/admin/mobile?phone=${encodeURIComponent(phone)}`);
  }

  function closeChat() {
    setSelectedPhone(null);
    setDetail(null);
    setProfilePhoto(null);
    setShowContact(false);
    window.history.replaceState({}, "", "/admin/mobile");
    void loadConversations();
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPhone || !reply.trim()) return;
    setSending(true);
    const response = await checkedFetch(`/api/atendimento/conversas/${encodeURIComponent(selectedPhone)}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply.trim() }),
    });
    const payload = await response.json().catch(() => null);
    if (payload?.success) {
      setReply("");
      await Promise.all([loadDetail(selectedPhone, false), loadConversations()]);
    }
    setSending(false);
  }

  async function conversationAction(action: "assume" | "resolve" | "pause_bot", paused?: boolean) {
    if (!selectedPhone) return;
    await checkedFetch(`/api/atendimento/conversas/${encodeURIComponent(selectedPhone)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, paused }),
    });
    await Promise.all([loadDetail(selectedPhone, false), loadConversations()]);
  }

  async function updateAppointment(id: string, status: string) {
    await checkedFetch(`/api/agendamentos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAgenda();
  }

  async function createCampaign() {
    setCampaignFeedback("");
    if (!campaignForm.name.trim() || !campaignForm.message.trim()) {
      setCampaignFeedback("Informe o nome e a mensagem da campanha.");
      return;
    }
    if (!campaignForm.confirmedAuthorized) {
      setCampaignFeedback("Confirme a autorização do público antes de criar.");
      return;
    }
    setCreatingCampaign(true);
    const selector = {
      type: campaignForm.type,
      days: campaignForm.days,
      serviceId: campaignForm.serviceId || undefined,
      authorizedOnly: campaignForm.authorizedOnly,
      neighborhood: campaignForm.neighborhood || undefined,
      vehicle: campaignForm.vehicle || undefined,
      unreadOnly: campaignForm.unreadOnly,
      handoffOnly: campaignForm.handoffOnly,
      appointmentStatus: campaignForm.appointmentStatus,
      interactedWithinDays: campaignForm.interactedWithinDays,
    };
    const response = await checkedFetch("/api/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignForm.name,
        message: campaignForm.message,
        selector,
        confirmedAuthorized: campaignForm.confirmedAuthorized,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (payload?.success) {
      setCampaignFeedback(`Campanha criada com ${payload.data.recipients} destinatários. Revise e toque em iniciar.`);
      setCampaignForm(emptyCampaignForm);
      await loadCampaigns();
    } else {
      setCampaignFeedback(payload?.error || "Não foi possível criar a campanha.");
    }
    setCreatingCampaign(false);
  }

  async function changeCampaignStatus(id: string, action: "start" | "pause" | "resume") {
    setCampaignFeedback("");
    const response = await checkedFetch(`/api/campanhas/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "pause" ? undefined : JSON.stringify({ concurrency: 1, delayMs: 60_000 }),
    });
    const payload = await response.json().catch(() => null);
    setCampaignFeedback(response.ok && (payload?.success || payload?.ok) ? "Campanha atualizada." : payload?.error || "Não foi possível atualizar a campanha.");
    await loadCampaigns();
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted" && "serviceWorker" in navigator) {
      await syncPushSubscription();
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: "SHOW_NOTIFICATION",
        title: "Notificações ativadas",
        body: "Você será avisado sobre novas mensagens mesmo com a central fechada.",
        tag: "pwa-ready",
        url: "/admin/mobile",
      });
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  if (authExpired) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d1b15] p-6 text-center shadow-2xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-brand-300" />
          <h1 className="mt-4 text-xl font-bold">Sessão protegida</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Entre novamente para acessar as conversas e os dados dos clientes.</p>
          <Link href="/admin/login?next=/admin/mobile" className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gold-gradient px-4 py-3 text-sm font-bold text-surface-950">Entrar no aplicativo</Link>
        </div>
      </main>
    );
  }

  if (selectedPhone) {
    const name = detail?.session.client?.name || detail?.flow.customerName || conversations.find((item) => item.phone === selectedPhone)?.clientName || "Cliente";
    const vehicle = detail?.session.client?.vehicleModel || detail?.flow.vehicleRaw;
    return (
      <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col overflow-hidden bg-[#07110d]">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[#10231a] px-2 py-2.5 shadow-lg" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
          <button type="button" onClick={closeChat} className="rounded-full p-2 text-slate-300 hover:bg-white/5" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => setShowContact(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Avatar name={name} photoUrl={profilePhoto} size="sm" online />
            <span className="min-w-0"><strong className="block truncate text-sm text-white">{name}</strong><span className="mt-0.5 block truncate text-[11px] text-emerald-200/70">{vehicle || formatPhone(selectedPhone)}</span></span>
          </button>
          <button type="button" onClick={() => setShowContact(true)} className="rounded-full p-2 text-slate-300 hover:bg-white/5" aria-label="Dados do cliente"><Info className="h-5 w-5" /></button>
          <button type="button" onClick={() => void refresh()} className="rounded-full p-2 text-slate-300 hover:bg-white/5" aria-label="Atualizar"><RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} /></button>
        </header>

        {detailLoading && !detail ? (
          <div className="flex flex-1 items-center justify-center bg-[#efeae2]"><Loader2 className="h-7 w-7 animate-spin text-[#1f513d]" /></div>
        ) : (
          <WhatsAppChatThread messages={detail?.messages ?? []} clientName={name} className="min-h-0 flex-1 rounded-none border-0" />
        )}

        {!online && <div className="flex items-center justify-center gap-2 bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-200"><WifiOff className="h-3.5 w-3.5" /> Sem internet — aguardando conexão</div>}
        <form onSubmit={sendReply} className="flex shrink-0 items-end gap-2 border-t border-white/[0.06] bg-[#0b1712] px-2.5 py-2.5" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
          <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={1} placeholder="Mensagem" className="max-h-28 min-h-11 flex-1 resize-none rounded-3xl border border-white/[0.08] bg-[#17251f] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/30" />
          <button type="submit" disabled={sending || !reply.trim() || !online} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1d6f50] text-white shadow-lg disabled:opacity-40" aria-label="Enviar mensagem">{sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button>
        </form>

        {showContact && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowContact(false)}>
            <section className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[#0c1813] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <div className="flex justify-end"><button type="button" onClick={() => setShowContact(false)} className="rounded-full p-2 text-slate-500 hover:bg-white/5"><X className="h-5 w-5" /></button></div>
              <div className="text-center"><span className="inline-flex"><Avatar name={name} photoUrl={profilePhoto} size="lg" online /></span><h2 className="mt-3 text-xl font-bold text-white">{name}</h2><p className="mt-1 text-sm text-slate-500">{formatPhone(selectedPhone)}</p></div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void conversationAction("assume")} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-3 text-xs font-semibold text-emerald-300"><Headphones className="h-4 w-4" /> Assumir conversa</button>
                <button type="button" onClick={() => void conversationAction("pause_bot", !detail?.session.botPaused)} className="flex items-center justify-center gap-2 rounded-xl bg-violet-500/10 px-3 py-3 text-xs font-semibold text-violet-300">{detail?.session.botPaused ? <Bot className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {detail?.session.botPaused ? "Ativar IA" : "Pausar IA"}</button>
              </div>
              <div className="mt-5 space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm">
                <p className="flex items-center gap-3 text-slate-300"><CarFront className="h-4 w-4 text-brand-300" /><span>{vehicle || "Veículo não informado"}{detail?.session.client?.vehiclePlate ? ` · ${detail.session.client.vehiclePlate}` : ""}</span></p>
                <p className="flex items-center gap-3 text-slate-300"><MessageCircle className="h-4 w-4 text-brand-300" /><span>{detail?.flow.serviceLabel || "Serviço em definição"}</span></p>
                {detail?.session.client?.email && <p className="flex items-center gap-3 break-all text-slate-400"><ContactRound className="h-4 w-4 shrink-0 text-brand-300" />{detail.session.client.email}</p>}
                {detail?.session.client?.address && <p className="text-xs leading-5 text-slate-500">{detail.session.client.address}</p>}
              </div>
              {detail?.flow.aiIntelligence && (
                <div className="mt-4 rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.09] to-sky-500/[0.04] p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><BrainCircuit className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">Leitura inteligente</h3><span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-200">Score {detail.flow.aiIntelligence.leadScore}</span>{detail.flow.aiIntelligence.needsHuman && <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-[10px] font-bold text-rose-200">Prioridade humana</span>}</div>
                      <p className="mt-2 text-xs leading-5 text-slate-300">{detail.flow.aiIntelligence.summary}</p>
                      <p className="mt-2 text-[11px] leading-5 text-slate-500"><strong className="text-slate-300">Próxima ação:</strong> {detail.flow.aiIntelligence.nextAction}</p>
                    </div>
                  </div>
                </div>
              )}
              <h3 className="mt-6 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Agendamentos do cliente</h3>
              <div className="mt-2 space-y-2">
                {(detail?.appointments ?? []).length ? detail?.appointments.map((appointment) => (
                  <div key={appointment.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
                    <CalendarDays className="h-5 w-5 text-brand-300" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-200">{appointment.service.name}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(appointment.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })} às {appointment.startTime}</p></div>
                    <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusStyles[appointment.status])}>{statusLabels[appointment.status] ?? appointment.status}</span>
                  </div>
                )) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-600">Nenhum agendamento registrado.</p>}
              </div>
              <button type="button" onClick={() => void conversationAction("resolve")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Concluir atendimento humano</button>
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-[#07110d] pb-24">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#10231a]/95 px-4 pb-3 backdrop-blur-xl" style={{ paddingTop: "max(0.9rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-black/25 ring-1 ring-brand-500/20"><span className="h-9 w-9 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: "url('/logo-garagem-do-ka.png')" }} /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300/70">Garagem do Ka</p><h1 className="truncate text-lg font-bold text-white">{tab === "chats" ? "Conversas" : tab === "agenda" ? "Agenda" : tab === "contacts" ? "Contatos" : tab === "ai" ? "Copiloto IA" : tab === "campaigns" ? "Campanhas" : "Aplicativo"}</h1></div>
          <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold", online ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300")}>{online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? "Online" : "Offline"}</span>
          <button type="button" onClick={() => void refresh()} className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Atualizar"><RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} /></button>
        </div>
        {(tab === "chats" || tab === "contacts") && (
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 focus-within:border-emerald-500/25">
            <Search className="h-4 w-4 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "chats" ? "Pesquisar conversas" : "Pesquisar contatos"} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
            {search && <button type="button" onClick={() => setSearch("")} className="text-slate-500"><X className="h-4 w-4" /></button>}
          </label>
        )}
        {tab === "chats" && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {(["all", "unread", "handoff"] as const).map((filter) => <button key={filter} type="button" onClick={() => setChatFilter(filter)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition", chatFilter === filter ? "bg-[#1d6f50] text-white" : "bg-white/[0.055] text-slate-400")}>{filter === "all" ? "Todas" : filter === "unread" ? "Não lidas" : "Aguardando equipe"}</button>)}
          </div>
        )}
      </header>

      {loading ? <div className="flex flex-1 items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-brand-300" /></div> : null}

      {!loading && tab === "chats" && (
        <section className="divide-y divide-white/[0.055]">
          {conversations.length ? conversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => openChat(conversation.phone)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-white/[0.05] sm:hover:bg-white/[0.035]">
              <Avatar name={conversation.clientName} online={conversation.lastMessageAt ? Date.now() - new Date(conversation.lastMessageAt).getTime() < 15 * 60_000 : false} />
              <span className="min-w-0 flex-1 border-b border-transparent"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-[15px] text-slate-100">{conversation.clientName}</strong>{conversation.ai?.needsHuman && <span className="rounded-full bg-rose-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-200">prioridade</span>}{conversation.ai && conversation.ai.leadScore >= 75 && !conversation.ai.needsHuman && <span className="rounded-full bg-violet-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-violet-200">quente</span>}<span className={cn("text-[11px]", conversation.unreadCount > 0 ? "font-bold text-emerald-300" : "text-slate-600")}>{relativeMessageTime(conversation.lastMessageAt)}</span></span><span className="mt-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">{conversation.lastMessagePreview || conversation.flowStageLabel}</span>{conversation.botPaused && <Pause className="h-3.5 w-3.5 text-violet-300" />}{conversation.unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-[#06100c]">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}</span>{(conversation.vehicleRaw || conversation.serviceLabel) && <span className="mt-1.5 flex items-center gap-1.5 truncate text-[10px] text-slate-600"><CarFront className="h-3 w-3" />{conversation.vehicleRaw || conversation.serviceLabel}</span>}</span>
            </button>
          )) : <div className="px-6 py-20 text-center"><MessageCircle className="mx-auto h-10 w-10 text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-400">Nenhuma conversa encontrada</p><p className="mt-1 text-xs text-slate-600">As mensagens recebidas pela WASender aparecerão aqui.</p></div>}
        </section>
      )}

      {!loading && tab === "agenda" && (
        <section className="p-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1a15] p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><CalendarDays className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Agenda operacional</p><p className="mt-0.5 text-sm font-semibold text-white">{new Date(`${agendaDate}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p></div><input type="date" value={agendaDate} onChange={(event) => setAgendaDate(event.target.value)} className="w-[42px] rounded-xl border border-white/10 bg-white/5 p-2 text-transparent outline-none [color-scheme:dark]" aria-label="Selecionar data" /></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/[0.035] p-2"><strong className="block text-lg text-white">{appointments.length}</strong><span className="text-[10px] text-slate-500">Reservas</span></div><div className="rounded-xl bg-white/[0.035] p-2"><strong className="block text-lg text-brand-300">{appointments.filter((item) => item.status === "IN_PROGRESS").length}</strong><span className="text-[10px] text-slate-500">Em serviço</span></div><div className="rounded-xl bg-white/[0.035] p-2"><strong className="block text-lg text-emerald-300">{appointments.filter((item) => item.status === "COMPLETED").length}</strong><span className="text-[10px] text-slate-500">Concluídos</span></div></div>
          </div>
          <div className="mt-4 space-y-2.5">
            {appointments.length ? appointments.map((appointment) => (
              <article key={appointment.id} className="rounded-2xl border border-white/[0.07] bg-[#0d1814] p-4">
                <div className="flex items-start gap-3"><div className="w-12 shrink-0 text-center"><strong className="text-base text-brand-200">{appointment.startTime}</strong><span className="mt-1 block text-[10px] text-slate-600">{appointment.endTime ? `até ${appointment.endTime}` : "horário"}</span></div><div className="min-w-0 flex-1 border-l border-white/[0.07] pl-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-white">{appointment.client?.name || "Cliente"}</h3><p className="mt-1 truncate text-xs text-slate-400">{appointment.service.name}</p>{appointment.client?.vehicleModel && <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-600"><CarFront className="h-3 w-3" />{appointment.client.vehicleModel}</p>}</div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", statusStyles[appointment.status])}>{statusLabels[appointment.status] ?? appointment.status}</span></div></div></div>
                <div className="mt-3 flex gap-2 border-t border-white/[0.055] pt-3">{appointment.client?.phone && <button type="button" onClick={() => openChat(appointment.client!.phone!)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300"><MessageCircle className="h-3.5 w-3.5" /> Conversar</button>}<select value={appointment.status} onChange={(event) => void updateAppointment(appointment.id, event.target.value)} className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-300 outline-none [color-scheme:dark]" aria-label="Atualizar status">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              </article>
            )) : <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center"><CalendarDays className="mx-auto h-9 w-9 text-slate-700" /><p className="mt-3 text-sm text-slate-500">Nenhum serviço nesta data.</p></div>}
          </div>
        </section>
      )}

      {!loading && tab === "contacts" && (
        <section>
          <div className="flex items-center gap-3 border-b border-white/[0.06] bg-emerald-500/[0.035] px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><ContactRound className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">Contatos telefônicos da sessão</p><p className="mt-0.5 text-[10px] text-slate-500">{syncedContacts.length} contatos válidos · {contactsSyncedAt ? `sincronizado ${relativeMessageTime(contactsSyncedAt)}` : "sincronizando"}</p><p className="mt-1 text-[9px] text-slate-600">Nomes da WASender, CRM ou agenda autorizada do celular.</p></div>
            <button type="button" onClick={() => void loadSyncedContacts(true)} disabled={syncingContacts} className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 disabled:opacity-50" aria-label="Sincronizar contatos"><RefreshCw className={cn("h-4 w-4", syncingContacts && "animate-spin")} /></button>
          </div>
          <div className="border-b border-white/[0.06] px-4 py-3"><button type="button" onClick={() => void importNamesFromDevice()} disabled={importingContactNames} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.065] px-3 py-2.5 text-xs font-semibold text-emerald-300 disabled:opacity-50">{importingContactNames ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />} Trazer nomes da agenda</button><p className="mt-1.5 text-center text-[9px] text-slate-600">No celular, autorize os contatos. Em outros aparelhos, selecione um arquivo .vcf.</p></div>
          <input ref={contactFileInput} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={(event) => { void importNamesFromVcard(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {contactNameFeedback && <div className="border-b border-white/[0.06] bg-sky-500/[0.045] px-4 py-2.5 text-[10px] leading-4 text-sky-200">{contactNameFeedback}</div>}
          <div className="divide-y divide-white/[0.055]">
          {filteredContacts.map((contact) => (
            <button key={contact.id} type="button" onClick={() => void openChat(contact.phone)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/5 sm:hover:bg-white/[0.035]">
              <Avatar name={contact.displayName} photoUrl={contact.profileUrl} online={contact.lastMessageAt ? Date.now() - new Date(contact.lastMessageAt).getTime() < 15 * 60_000 : false} />
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="block min-w-0 flex-1 truncate text-sm text-slate-100">{contact.displayName}</strong>{contact.unreadCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-[#06100c]">{contact.unreadCount}</span>}</span><span className="mt-1 block text-xs text-slate-500">{formatPhone(contact.phone)}</span><span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">{contact.crmClient && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300">CRM</span>}{contact.marketingConsent && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">Autorizado</span>}{contact.crmClient?.vehicleModel && <span>{contact.crmClient.vehicleModel}</span>}{contact.about && <span className="max-w-40 truncate">{contact.about}</span>}</span></span>
              <ChevronRight className="h-4 w-4 text-slate-700" />
            </button>
          ))}
          {!filteredContacts.length && <div className="px-6 py-16 text-center"><ContactRound className="mx-auto h-9 w-9 text-slate-700" /><p className="mt-3 text-sm text-slate-500">Nenhum contato sincronizado.</p></div>}
          </div>
        </section>
      )}

      {!loading && tab === "ai" && (
        <section className="p-4">
          <AiOperationsPanel compact />
        </section>
      )}

      {!loading && tab === "campaigns" && (
        <section className="space-y-4 p-4">
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.045] p-4">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300"><Radio className="h-5 w-5" /></span><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-slate-100">Status do WhatsApp</h2><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">API indisponível</span></div><p className="mt-1.5 text-xs leading-5 text-slate-500">A WASender ainda não documenta publicação de Status. O app não usa endpoint não oficial para evitar bloqueio da sessão.</p></div></div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1814] p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Megaphone className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-brand-300/70">Nova campanha</p><h2 className="text-sm font-semibold text-white">Comunicação segmentada</h2></div><span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-center"><strong className="block text-base text-emerald-300">{campaignPreview ?? "—"}</strong><span className="text-[9px] text-slate-500">destinatários</span></span></div>
            <div className="mt-4 space-y-3">
              <input value={campaignForm.name} onChange={(event) => setCampaignForm((form) => ({ ...form, name: event.target.value }))} placeholder="Nome da campanha" className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" />
              <select value={campaignForm.type} onChange={(event) => setCampaignForm((form) => ({ ...form, type: event.target.value as typeof form.type }))} className="w-full rounded-xl border border-white/[0.08] bg-[#101d17] px-3 py-2.5 text-sm text-slate-300 outline-none [color-scheme:dark]">
                <option value="advanced">Filtros avançados</option><option value="all">Todos os autorizados</option><option value="inactive">Clientes inativos</option><option value="service">Por serviço realizado</option>
              </select>
              {campaignForm.type === "inactive" && <input type="number" min={1} value={campaignForm.days} onChange={(event) => setCampaignForm((form) => ({ ...form, days: Number(event.target.value) }))} placeholder="Dias sem atendimento" className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />}
              {(campaignForm.type === "service" || campaignForm.type === "advanced") && <select value={campaignForm.serviceId} onChange={(event) => setCampaignForm((form) => ({ ...form, serviceId: event.target.value }))} className="w-full rounded-xl border border-white/[0.08] bg-[#101d17] px-3 py-2.5 text-sm text-slate-300 outline-none [color-scheme:dark]"><option value="">Qualquer serviço</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>}
              {campaignForm.type === "advanced" && <div className="grid grid-cols-2 gap-2"><input value={campaignForm.neighborhood} onChange={(event) => setCampaignForm((form) => ({ ...form, neighborhood: event.target.value }))} placeholder="Bairro" className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" /><input value={campaignForm.vehicle} onChange={(event) => setCampaignForm((form) => ({ ...form, vehicle: event.target.value }))} placeholder="Veículo" className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" /><select value={campaignForm.appointmentStatus} onChange={(event) => setCampaignForm((form) => ({ ...form, appointmentStatus: event.target.value as typeof form.appointmentStatus }))} className="rounded-xl border border-white/[0.08] bg-[#101d17] px-3 py-2.5 text-xs text-slate-300 outline-none [color-scheme:dark]"><option value="any">Qualquer agenda</option><option value="scheduled">Com reserva ativa</option><option value="completed">Já atendidos</option><option value="none">Sem agendamento</option></select><input type="number" min={1} value={campaignForm.interactedWithinDays} onChange={(event) => setCampaignForm((form) => ({ ...form, interactedWithinDays: Number(event.target.value) }))} className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-xs text-white outline-none" title="Interagiu nos últimos dias" /></div>}
              {campaignForm.type === "advanced" && <div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-full bg-white/[0.045] px-3 py-2 text-[11px] text-slate-400"><input type="checkbox" checked={campaignForm.unreadOnly} onChange={(event) => setCampaignForm((form) => ({ ...form, unreadOnly: event.target.checked }))} className="accent-emerald-500" /> Não lidas</label><label className="flex items-center gap-2 rounded-full bg-white/[0.045] px-3 py-2 text-[11px] text-slate-400"><input type="checkbox" checked={campaignForm.handoffOnly} onChange={(event) => setCampaignForm((form) => ({ ...form, handoffOnly: event.target.checked }))} className="accent-emerald-500" /> Atendimento humano</label><label className="flex items-center gap-2 rounded-full bg-white/[0.045] px-3 py-2 text-[11px] text-slate-400"><input type="checkbox" checked={campaignForm.authorizedOnly} onChange={(event) => setCampaignForm((form) => ({ ...form, authorizedOnly: event.target.checked }))} className="accent-emerald-500" /> Somente autorizados</label></div>}
              <textarea value={campaignForm.message} onChange={(event) => setCampaignForm((form) => ({ ...form, message: event.target.value }))} rows={5} className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 text-sm leading-6 text-white outline-none" />
              <p className="text-[10px] text-slate-600">Use <strong className="text-brand-300">{"{name}"}</strong> para personalizar. O envio respeita bloqueios e números privados válidos.</p>
              <label className="flex items-start gap-2.5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3 text-[11px] leading-5 text-slate-400"><input type="checkbox" checked={campaignForm.confirmedAuthorized} onChange={(event) => setCampaignForm((form) => ({ ...form, confirmedAuthorized: event.target.checked }))} className="mt-1 accent-emerald-500" /> Confirmo que o público possui autorização ou relacionamento legítimo e poderá solicitar descadastro.</label>
              {campaignFeedback && <p className="rounded-xl bg-white/[0.035] px-3 py-2.5 text-xs text-slate-300">{campaignFeedback}</p>}
              <button type="button" onClick={() => void createCampaign()} disabled={creatingCampaign || (campaignPreview ?? 0) === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3 text-sm font-bold text-surface-950 disabled:opacity-40">{creatingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} Criar campanha</button>
            </div>
          </div>

          <div className="space-y-2.5"><h3 className="px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Campanhas recentes</h3>{campaigns.map((campaign) => <article key={campaign.id} className="rounded-2xl border border-white/[0.07] bg-[#0d1814] p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-semibold text-white">{campaign.name}</h4><p className="mt-1 text-[11px] text-slate-500">{campaign.successCount}/{campaign.totalRecipients ?? 0} enviados · {campaign.failCount} falhas</p></div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", campaign.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-300" : campaign.status === "RUNNING" ? "bg-sky-500/10 text-sky-300" : campaign.status === "PAUSED" ? "bg-amber-500/10 text-amber-300" : "bg-white/[0.06] text-slate-400")}>{campaign.status === "DRAFT" ? "Rascunho" : campaign.status === "RUNNING" ? "Enviando" : campaign.status === "PAUSED" ? "Pausada" : "Concluída"}</span></div>{campaign.status !== "COMPLETED" && <button type="button" onClick={() => void changeCampaignStatus(campaign.id, campaign.status === "RUNNING" ? "pause" : campaign.status === "PAUSED" ? "resume" : "start")} className="mt-3 w-full rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-brand-300">{campaign.status === "RUNNING" ? "Pausar" : campaign.status === "PAUSED" ? "Retomar" : "Revisado — iniciar envio"}</button>}</article>)}{!campaigns.length && <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-600">Nenhuma campanha criada.</p>}</div>
        </section>
      )}

      {!loading && tab === "settings" && (
        <section className="space-y-4 p-4">
          <div className="overflow-hidden rounded-3xl border border-brand-500/15 bg-gradient-to-br from-[#173426] to-[#0b1712] p-5"><div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-black/25 ring-1 ring-brand-500/20"><span className="h-12 w-12 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: "url('/logo-garagem-do-ka.png')" }} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300/70">PWA instalado</p><h2 className="mt-1 text-lg font-bold text-white">Garagem do Ka</h2><p className="text-xs text-slate-400">Central de atendimento mobile</p></div></div><PwaInstallButton className="mt-5 w-full" /></div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1814] p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">{notificationPermission === "granted" ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-white">Notificações de mensagens</h3><p className="mt-0.5 text-xs text-slate-500">{notificationPermission === "granted" ? "Ativadas neste dispositivo" : notificationPermission === "denied" ? "Bloqueadas pelo navegador" : "Receba alertas de novos clientes"}</p></div>{notificationPermission === "granted" ? <Check className="h-5 w-5 text-emerald-300" /> : <button type="button" onClick={() => void enableNotifications()} disabled={notificationPermission === "denied" || notificationPermission === "unsupported"} className="rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-40">Ativar</button>}</div></div>
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1814]"><Link href="/admin/dashboard" className="flex items-center gap-3 border-b border-white/[0.055] p-4 text-sm text-slate-300"><PanelLeft className="h-4.5 w-4.5 text-brand-300" /><span className="flex-1">Abrir painel completo</span><ChevronRight className="h-4 w-4 text-slate-600" /></Link><Link href="/admin/configuracoes" className="flex items-center gap-3 border-b border-white/[0.055] p-4 text-sm text-slate-300"><Settings className="h-4.5 w-4.5 text-brand-300" /><span className="flex-1">Configurações</span><ChevronRight className="h-4 w-4 text-slate-600" /></Link><button type="button" onClick={() => void logout()} className="flex w-full items-center gap-3 p-4 text-left text-sm text-red-300"><LogOut className="h-4.5 w-4.5" /><span className="flex-1">Sair do aplicativo</span></button></div>
          <p className="px-3 text-center text-[10px] leading-5 text-slate-700">Os contatos e mensagens são os mesmos do painel CRM. Dados protegidos pela sessão administrativa.</p>
        </section>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid w-full max-w-3xl grid-cols-6 border-t border-white/[0.07] bg-[#0b1712]/95 px-1 pt-2 backdrop-blur-xl" style={{ paddingBottom: "max(0.55rem, env(safe-area-inset-bottom))" }}>
        {[
          { id: "chats" as const, label: "Conversas", icon: MessageCircle, badge: conversations.reduce((total, item) => total + item.unreadCount, 0) },
          { id: "agenda" as const, label: "Agenda", icon: CalendarDays, badge: 0 },
          { id: "contacts" as const, label: "Contatos", icon: ContactRound, badge: 0 },
          { id: "ai" as const, label: "IA", icon: BrainCircuit, badge: conversations.filter((item) => item.ai?.needsHuman).length },
          { id: "campaigns" as const, label: "Campanhas", icon: Megaphone, badge: 0 },
          { id: "settings" as const, label: "Ajustes", icon: Menu, badge: 0 },
        ].map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => { setTab(item.id); setSearch(""); }} className={cn("relative flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[9px] font-semibold transition sm:text-[10px]", tab === item.id ? "text-emerald-300" : "text-slate-600")}><span className={cn("relative rounded-xl px-3 py-1 sm:px-4", tab === item.id && "bg-emerald-500/10")}><Icon className="h-5 w-5" />{item.badge > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-[#06100c]">{item.badge > 99 ? "99+" : item.badge}</span>}</span>{item.label}</button>;
        })}
      </nav>
    </main>
  );
}
