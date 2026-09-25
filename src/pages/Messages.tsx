import { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Mic, MessageSquare, Pause, Phone, PhoneOff, Play, Search, SendHorizonal, Square } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, PageHeader, Avatar } from "../components/ui";
import { toast } from "../components/feedback";
import { getDb, saveDb, genId, logActivity, useDbVersion } from "../utils/db";
import type { User, Message } from "../types";

const MAX_VOICE_SECONDS = 120;

const ROLE_CHIP: Record<string, string> = {
  headteacher: "bg-emerald-100 text-emerald-800",
  deputy: "bg-emerald-100 text-emerald-800",
  hod: "bg-amber-100 text-amber-800",
  teacher: "bg-blue-100 text-blue-800",
  pupil: "bg-gray-100 text-gray-700",
};
const ROLE_NAME: Record<string, string> = { headteacher: "Headteacher", deputy: "Deputy", hod: "HoD", teacher: "Teacher", pupil: "Pupil" };

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

export default function Messages() {
  const { user } = useAuth();
  const version = useDbVersion();
  const db = useMemo(() => getDb(), [version]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [search, setSearch] = useState("");
  const [callActive, setCallActive] = useState<{ user: User; startedAt: number; duration: number; interval?: number } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const recordDurationRef = useRef(0);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const currentUserId = user?.id ?? "";
  const allUsers = useMemo(() => db.users.filter((u) => u.id !== currentUserId), [db, currentUserId]);
  const messages = db.messages;

  const conversations = useMemo(() => {
    const map: Record<string, Message[]> = {};
    messages.forEach((m) => {
      const other = m.fromId === currentUserId ? m.toId : m.fromId;
      (map[other] ||= []).push(m);
    });
    return Object.entries(map).map(([otherId, msgs]) => {
      const otherUser = allUsers.find((u) => u.id === otherId);
      if (!otherUser) return null;
      const sorted = [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const last = sorted[sorted.length - 1];
      const unread = sorted.filter((m) => m.toId === currentUserId && !m.read).length;
      return { otherUser, last, unread, messages: sorted };
    }).filter(Boolean).sort((a, b) => b!.last.timestamp.localeCompare(a!.last.timestamp)) as { otherUser: User; last: Message; unread: number; messages: Message[] }[];
  }, [messages, allUsers, currentUserId]);

  const activeDbUser = useMemo(() => allUsers.find((u) => u.id === activeUserId) || null, [allUsers, activeUserId]);

  const activeMessages = useMemo(() => {
    if (!activeUserId) return [];
    return messages
      .filter((m) => (m.fromId === currentUserId && m.toId === activeUserId) || (m.fromId === activeUserId && m.toId === currentUserId))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [messages, currentUserId, activeUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessages.length, activeUserId]);

  // Mark incoming messages as read when a conversation is open.
  useEffect(() => {
    if (!activeUserId || !currentUserId) return;
    const db2 = getDb();
    let changed = false;
    db2.messages.forEach((m) => {
      if (m.toId === currentUserId && m.fromId === activeUserId && !m.read) { m.read = true; changed = true; }
    });
    if (changed) saveDb(db2);
  }, [activeUserId, currentUserId, version]);

  // Stop any recording or call timer when leaving the page.
  useEffect(() => () => {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    Object.values(audioRefs.current).forEach((a) => a?.pause());
  }, []);

  if (!user) return null;
  const currentUser = user;

  function pushMessage(msg: Omit<Message, "id" | "fromId" | "timestamp" | "read">) {
    const db2 = getDb();
    db2.messages.push({ id: genId("msg"), fromId: currentUser.id, timestamp: new Date().toISOString(), read: false, ...msg });
    saveDb(db2);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice notes aren't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = recordDurationRef.current;
        if (duration < 1) return;
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => sendVoiceMessage(reader.result as string, duration);
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      recordDurationRef.current = 0;
      setRecordDuration(0);
      setIsRecording(true);
      recordIntervalRef.current = window.setInterval(() => {
        recordDurationRef.current += 1;
        setRecordDuration(recordDurationRef.current);
        if (recordDurationRef.current >= MAX_VOICE_SECONDS) stopRecording();
      }, 1000);
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser settings to send voice notes.");
    }
  }
  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    if (recordIntervalRef.current) { clearInterval(recordIntervalRef.current); recordIntervalRef.current = null; }
    setIsRecording(false);
  }
  function sendVoiceMessage(dataUrl: string, duration: number) {
    if (!activeUserId) return;
    pushMessage({ toId: activeUserId, text: `Voice note (${duration}s)`, kind: "voice", voiceDataUrl: dataUrl, voiceDuration: duration });
    setRecordDuration(0);
  }

  function sendMessage() {
    const text = newText.trim();
    if (!text || !activeUserId) return;
    pushMessage({ toId: activeUserId, text, kind: "message" });
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Sent message to ${activeDbUser?.fullName || activeUserId}`);
    setNewText("");
  }

  function togglePlay(m: Message) {
    let audio = audioRefs.current[m.id];
    if (!audio) {
      audio = new Audio(m.voiceDataUrl);
      audio.onended = () => setPlayingId((id) => (id === m.id ? null : id));
      audioRefs.current[m.id] = audio;
    }
    Object.entries(audioRefs.current).forEach(([id, a]) => { if (id !== m.id) a?.pause(); });
    if (audio.paused) { audio.play(); setPlayingId(m.id); } else { audio.pause(); setPlayingId(null); }
  }

  function startCall(other: User) {
    if (callActive) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setCallActive((prev) => prev ? { ...prev, duration: Math.floor((Date.now() - prev.startedAt) / 1000) } : prev);
    }, 1000);
    setCallActive({ user: other, startedAt, duration: 0, interval });
    pushMessage({ toId: other.id, text: "Call started", kind: "call-answered" });
  }

  function endCall() {
    if (!callActive) return;
    if (callActive.interval) clearInterval(callActive.interval);
    pushMessage({ toId: callActive.user.id, text: `Call ended (${formatDuration(callActive.duration)})`, kind: "call-answered", callDuration: callActive.duration });
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Call with ${callActive.user.fullName} ended`, formatDuration(callActive.duration));
    setCallActive(null);
  }

  const q = search.trim().toLowerCase();
  const filteredConversations = conversations.filter((c) => !q || c.otherUser.fullName.toLowerCase().includes(q));
  const otherPeople = q
    ? allUsers.filter((u) => !conversations.some((c) => c.otherUser.id === u.id) && (u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.teacherId || "").toLowerCase().includes(q) || (u.pupilId || "").toLowerCase().includes(q)))
    : [];

  return (
    <div className="space-y-4">
      <PageHeader title="Messages" subtitle={currentUser.role === "pupil" ? "Chat with your teachers and school staff" : "Chat with anyone in the school community"} />

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100dvh-220px)] min-h-[440px]">
        {/* Conversation list */}
        <Card className={`flex-col overflow-hidden !p-0 ${activeUserId ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input aria-label="Search people" placeholder="Search or start a new chat…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && !q && (
              <div className="p-8 text-sm text-gray-500 text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                No conversations yet. Search for someone above to start chatting.
              </div>
            )}
            {filteredConversations.map((c) => (
              <button
                key={c.otherUser.id}
                onClick={() => setActiveUserId(c.otherUser.id)}
                className={`w-full text-left px-3 py-3 border-b border-gray-50 flex items-center gap-3 transition-colors ${activeUserId === c.otherUser.id ? "bg-emerald-50" : "hover:bg-gray-50"}`}
              >
                <Avatar name={c.otherUser.fullName} src={c.otherUser.profilePicture} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`text-sm truncate ${c.unread ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>{c.otherUser.fullName}</div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{new Date(c.last.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className={`text-xs truncate ${c.unread ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                      {c.last.fromId === currentUser.id ? "You: " : ""}{c.last.kind === "voice" ? "🎙 Voice note" : c.last.text}
                    </div>
                    {c.unread > 0 && <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{c.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
            {otherPeople.length > 0 && <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">People</div>}
            {otherPeople.map((u) => (
              <button key={u.id} onClick={() => { setActiveUserId(u.id); setSearch(""); }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-3">
                <Avatar name={u.fullName} src={u.profilePicture} size="sm" />
                <div className="min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{u.fullName}</div>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${ROLE_CHIP[u.role]}`}>{ROLE_NAME[u.role]}{u.grade ? ` · ${u.grade}` : ""}</span>
                </div>
              </button>
            ))}
            {q && filteredConversations.length === 0 && otherPeople.length === 0 && (
              <p className="p-6 text-sm text-gray-500 text-center">No one matches “{search}”.</p>
            )}
          </div>
        </Card>

        {/* Chat area */}
        <Card className={`flex-col !p-0 overflow-hidden ${activeUserId ? "flex" : "hidden md:flex"}`}>
          {!activeDbUser ? (
            <div className="flex-1 flex items-center justify-center text-center p-10 text-gray-500">
              <div>
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4"><MessageSquare className="w-8 h-8" /></div>
                <h3 className="font-semibold text-lg text-gray-800">Your messages</h3>
                <p className="text-sm mt-1 max-w-xs">Select a conversation, or search for someone to start a new one.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 bg-white">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setActiveUserId(null)} className="md:hidden p-2 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Back to conversations"><ArrowLeft className="w-5 h-5" /></button>
                  <Avatar name={activeDbUser.fullName} src={activeDbUser.profilePicture} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900 truncate">{activeDbUser.fullName}</div>
                    <div className="text-xs text-gray-500">{ROLE_NAME[activeDbUser.role]}{activeDbUser.grade ? ` · Grade ${activeDbUser.grade}` : ""}</div>
                  </div>
                </div>
                {!callActive && currentUser.role !== "pupil" && (
                  <Button variant="success" className="!px-3" onClick={() => startCall(activeDbUser)} aria-label={`Call ${activeDbUser.fullName}`}><Phone className="w-4 h-4" /><span className="hidden sm:inline">Call</span></Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-1.5 bg-gray-50">
                {activeMessages.length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-10">No messages yet. Say hello 👋</div>
                )}
                {activeMessages.map((m, i) => {
                  const mine = m.fromId === currentUser.id;
                  const isCall = m.kind === "call-answered" || m.kind === "call-missed";
                  const showDay = i === 0 || dayLabel(activeMessages[i - 1].timestamp) !== dayLabel(m.timestamp);
                  const time = new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={m.id}>
                      {showDay && <div className="text-center my-3"><span className="text-[11px] font-medium text-gray-500 bg-white ring-1 ring-gray-200 rounded-full px-3 py-1">{dayLabel(m.timestamp)}</span></div>}
                      {isCall ? (
                        <div className="flex justify-center"><span className="inline-flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-full px-3 py-1"><Phone className="w-3 h-3" />{m.text} · {time}</span></div>
                      ) : (
                        <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? "bg-emerald-600 text-white rounded-br-md" : "bg-white ring-1 ring-gray-200 text-gray-800 rounded-bl-md"}`}>
                            {m.kind === "voice" && m.voiceDataUrl ? (
                              <div className="flex items-center gap-2.5 min-w-[170px]">
                                <button onClick={() => togglePlay(m)} className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${mine ? "bg-white/25 hover:bg-white/35" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`} aria-label={playingId === m.id ? "Pause voice note" : "Play voice note"}>
                                  {playingId === m.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                                </button>
                                <div className={`flex-1 h-1 rounded-full ${mine ? "bg-white/40" : "bg-gray-200"}`}><div className={`h-full rounded-full ${playingId === m.id ? "w-1/2" : "w-0"} ${mine ? "bg-white" : "bg-emerald-500"} transition-all`} /></div>
                                <span className="text-xs tabular-nums">{formatDuration(m.voiceDuration || 0)}</span>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap break-words">{m.text}</div>
                            )}
                            <div className={`text-[10px] mt-0.5 text-right ${mine ? "text-emerald-100" : "text-gray-400"}`}>{time}{mine && m.read ? " · Seen" : ""}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {isRecording ? (
                <div className="p-3 border-t border-gray-100 flex gap-3 items-center bg-red-50">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-red-700 flex-1 tabular-nums">Recording… {formatDuration(recordDuration)} <span className="text-red-400">/ {formatDuration(MAX_VOICE_SECONDS)}</span></span>
                  <Button variant="danger" onClick={stopRecording}><Square className="w-4 h-4" />Stop & send</Button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="p-2.5 sm:p-3 border-t border-gray-100 flex gap-2 items-center bg-white">
                  <button type="button" onClick={startRecording} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 flex items-center justify-center flex-shrink-0 transition-colors" aria-label="Record voice note">
                    <Mic className="w-5 h-5" />
                  </button>
                  <Input aria-label="Message" placeholder="Type a message…" value={newText} onChange={(e) => setNewText(e.target.value)} className="flex-1" autoComplete="off" />
                  <Button type="submit" variant="gold" disabled={!newText.trim()} className="flex-shrink-0 !px-3 sm:!px-4" aria-label="Send"><SendHorizonal className="w-4 h-4" /><span className="hidden sm:inline">Send</span></Button>
                </form>
              )}
            </>
          )}
        </Card>
      </div>

      {callActive && (
        <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-overlayIn">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center animate-modalIn">
            <div className="text-sm text-gray-500 mb-4">In call with</div>
            <Avatar name={callActive.user.fullName} src={callActive.user.profilePicture} size="xl" className="mx-auto ring-4 ring-emerald-500 ring-offset-4 animate-pulse" />
            <h2 className="text-xl font-bold text-gray-900 mt-5">{callActive.user.fullName}</h2>
            <p className="text-3xl font-mono text-emerald-600 mt-2 tabular-nums">{formatDuration(callActive.duration)}</p>
            <div className="mt-7">
              <button onClick={endCall} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full font-semibold shadow-lg transition-colors">
                <PhoneOff className="w-5 h-5" />End call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
