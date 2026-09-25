import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, PageHeader, Badge } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import type { User, Message } from "../types";

export default function Messages() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const allUsers = useMemo(() => db.users.filter((u) => u.id !== currentUser.id), [db, currentUser.id]);
  const messages = useMemo(() => db.messages || [], [db]);

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [search, setSearch] = useState("");
  const [callActive, setCallActive] = useState<{ user: User; startedAt: number; duration: number; interval?: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice note recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          sendVoiceMessage(reader.result as string, recordDuration);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordDuration(0);
      recordIntervalRef.current = window.setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } catch (err) {
      alert("Could not access microphone. Please allow microphone access to send voice messages.");
    }
  }
  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordIntervalRef.current) { clearInterval(recordIntervalRef.current); recordIntervalRef.current = null; }
    setIsRecording(false);
  }
  function sendVoiceMessage(dataUrl: string, duration: number) {
    if (!activeUserId) return;
    const db2 = getDb();
    const msg: Message = {
      id: genId("msg"),
      fromId: currentUser.id,
      toId: activeUserId,
      text: `🎙 Voice note (${duration}s)`,
      timestamp: new Date().toISOString(),
      read: false,
      kind: "voice",
      voiceDataUrl: dataUrl,
      voiceDuration: duration,
    };
    db2.messages.push(msg);
    saveDb(db2);
    setRefreshKey((k) => k + 1);
    setRecordDuration(0);
  }

  // Build conversation list grouped by the other user
  const conversations = useMemo(() => {
    const map: Record<string, Message[]> = {};
    messages.forEach((m) => {
      const other = m.fromId === currentUser.id ? m.toId : m.fromId;
      if (!map[other]) map[other] = [];
      map[other].push(m);
    });
    return Object.entries(map).map(([otherId, msgs]) => {
      const otherUser = allUsers.find((u) => u.id === otherId);
      if (!otherUser) return null;
      const sorted = [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const last = sorted[sorted.length - 1];
      const unread = sorted.filter((m) => m.toId === currentUser.id && !m.read).length;
      return { otherUser, last, unread, messages: sorted };
    }).filter(Boolean) as { otherUser: User; last: Message; unread: number; messages: Message[] }[];
  }, [messages, allUsers, currentUser.id]);

  const activeDbUser = useMemo(() => allUsers.find((u) => u.id === activeUserId) || null, [allUsers, activeUserId]);

  const activeMessages = useMemo(() => {
    if (!activeUserId) return [];
    return messages
      .filter((m) =>
        (m.fromId === currentUser.id && m.toId === activeUserId) ||
        (m.fromId === activeUserId && m.toId === currentUser.id)
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [messages, currentUser.id, activeUserId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, activeUserId]);

  // Mark messages as read when opening a conversation
  useEffect(() => {
    if (!activeUserId) return;
    const db2 = getDb();
    let changed = false;
    db2.messages.forEach((m) => {
      if (m.toId === currentUser.id && m.fromId === activeUserId && !m.read) {
        m.read = true;
        changed = true;
      }
    });
    if (changed) {
      saveDb(db2);
      setRefreshKey((k) => k + 1);
    }
  }, [activeUserId, currentUser.id, refreshKey]);

  // Simulated incoming call - randomly very rarely, or allow starting from UI
  function sendMessage() {
    const text = newText.trim();
    if (!text || !activeUserId) return;
    const db2 = getDb();
    const msg: Message = {
      id: genId("msg"),
      fromId: currentUser.id,
      toId: activeUserId,
      text,
      timestamp: new Date().toISOString(),
      read: false,
      kind: "message",
    };
    db2.messages.push(msg);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Sent message to ${activeDbUser?.fullName || activeUserId}`);
    setNewText("");
    setRefreshKey((k) => k + 1);
  }

  function startCall(other: User) {
    if (callActive) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setCallActive((prev) => prev ? { ...prev, duration: Math.floor((Date.now() - prev.startedAt) / 1000) } : prev);
    }, 1000);
    setCallActive({ user: other, startedAt, duration: 0, interval });
    // log the call start
    const db2 = getDb();
    db2.messages.push({
      id: genId("msg"),
      fromId: currentUser.id,
      toId: other.id,
      text: `📞 Call started`,
      timestamp: new Date().toISOString(),
      read: false,
      kind: "call-answered",
    });
    saveDb(db2);
    setActiveUserId(other.id);
    setRefreshKey((k) => k + 1);
  }

  function endCall() {
    if (!callActive) return;
    if (callActive.interval) clearInterval(callActive.interval);
    const db2 = getDb();
    db2.messages.push({
      id: genId("msg"),
      fromId: currentUser.id,
      toId: callActive.user.id,
      text: `📞 Call ended (${formatDuration(callActive.duration)})`,
      timestamp: new Date().toISOString(),
      read: false,
      kind: "call-answered",
      callDuration: callActive.duration,
    });
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Call with ${callActive.user.fullName} ended`, `${formatDuration(callActive.duration)}`);
    setCallActive(null);
    setRefreshKey((k) => k + 1);
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function startNewChat() {
    setActiveUserId(null);
    setSearch("");
  }

  const filteredUsers = allUsers.filter((u) => {
    const s = search.toLowerCase();
    return !s || u.fullName.toLowerCase().includes(s) || u.username.toLowerCase().includes(s) || (u.teacherId || "").toLowerCase().includes(s) || (u.pupilId || "").toLowerCase().includes(s);
  });

  const roleColor: Record<string, string> = {
    headteacher: "bg-emerald-100 text-emerald-800",
    deputy: "bg-emerald-100 text-emerald-800",
    hod: "bg-amber-100 text-amber-800",
    teacher: "bg-blue-100 text-blue-800",
    pupil: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Messaging & Calls" subtitle="Free chat and voice calls with any member of the school community">
        <Button variant="gold" onClick={startNewChat}>+ New Chat</Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-220px)]">
        {/* Conversations list */}
        <Card className="flex flex-col overflow-hidden !p-0">
          <div className="p-3 border-b">
            <Input placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && !search && (
              <div className="p-6 text-sm text-gray-500 text-center">
                <div className="text-4xl mb-2">💬</div>
                No conversations yet. Click "+ New Chat" to start.
              </div>
            )}
            {conversations
              .filter((c) => !search || c.otherUser.fullName.toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => b.last.timestamp.localeCompare(a.last.timestamp))
              .map((c) => (
                <button
                  key={c.otherUser.id}
                  onClick={() => setActiveUserId(c.otherUser.id)}
                  className={`w-full text-left p-3 border-b hover:bg-gray-50 flex items-center gap-3 ${activeUserId === c.otherUser.id ? "bg-emerald-50" : ""}`}
                >
                  {c.otherUser.profilePicture ? (
                    <img src={c.otherUser.profilePicture} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                      {c.otherUser.fullName.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm truncate">{c.otherUser.fullName}</div>
                      {c.unread > 0 && <Badge color="green">{c.unread}</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {c.last.kind !== "message" ? "📞 " : ""}
                      {c.last.fromId === currentUser.id ? "You: " : ""}{c.last.text.length > 40 ? c.last.text.slice(0, 40) + "..." : c.last.text}
                    </div>
                  </div>
                </button>
              ))}

            {search && filteredUsers.filter((u) => !conversations.find((c) => c.otherUser.id === u.id)).map((u) => (
              <button
                key={u.id}
                onClick={() => setActiveUserId(u.id)}
                className="w-full text-left p-3 border-b hover:bg-gray-50 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-gray-300 text-white flex items-center justify-center font-bold">{u.fullName.charAt(0)}</div>
                <div>
                  <div className="font-semibold text-sm">{u.fullName}</div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${roleColor[u.role]}`}>{u.role}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Chat area */}
        <Card className="md:col-span-2 flex flex-col !p-0 overflow-hidden">
          {!activeUserId ? (
            <div className="flex-1 flex items-center justify-center text-center p-10 text-gray-500">
              <div>
                <div className="text-6xl mb-3">💬</div>
                <h3 className="font-semibold text-lg text-gray-700">Your messages</h3>
                <p className="text-sm mt-1">Select a conversation or start a new one to begin chatting. Free messaging and calling across the whole school.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeDbUser && (
                <div className="p-3 border-b flex items-center justify-between bg-gray-50">
                  <div className="flex items-center gap-3">
                    {activeDbUser.profilePicture ? (
                      <img src={activeDbUser.profilePicture} className="w-10 h-10 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">{activeDbUser.fullName.charAt(0)}</div>
                    )}
                    <div>
                      <div className="font-semibold text-sm">{activeDbUser.fullName}</div>
                      <div className="text-xs text-gray-500 capitalize">{activeDbUser.role.replace("_", " ")}{activeDbUser.grade ? ` • ${activeDbUser.grade}` : ""}</div>
                    </div>
                  </div>
                  {!callActive && currentUser.role !== "pupil" && (
                    <Button variant="success" onClick={() => startCall(activeDbUser)}>📞 Call</Button>
                  )}
                </div>
              )}

              {activeDbUser ? (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                    {activeMessages.length === 0 && (
                      <div className="text-center text-gray-500 text-sm py-10">No messages yet. Say hello 👋</div>
                    )}
                {activeMessages.map((m) => {
                  const mine = m.fromId === currentUser.id;
                  const isCall = m.kind === "call-answered" || m.kind === "call-missed";
                  const isVoice = m.kind === "voice";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm ${isCall ? "bg-amber-50 text-amber-800 italic border border-amber-200 text-center w-full max-w-xs" : mine ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-800"}`}>
                        {isVoice && m.voiceDataUrl ? (
                          <div className="flex items-center gap-2 min-w-[160px]">
                            <button
                              onClick={() => {
                                let audio = audioRefs.current[m.id];
                                if (!audio) {
                                  audio = new Audio(m.voiceDataUrl);
                                  audioRefs.current[m.id] = audio;
                                }
                                if (audio.paused) audio.play();
                                else audio.pause();
                              }}
                              className="w-8 h-8 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center text-lg"
                              title="Play/Pause"
                            >
                              ▶
                            </button>
                            <div className="flex-1 h-1.5 bg-white/30 rounded-full overflow-hidden">
                              <div className="h-full bg-white w-full" style={{ width: "100%" }} />
                            </div>
                            <span className="text-xs font-mono">{m.voiceDuration}s</span>
                          </div>
                        ) : (
                          <div>{m.text}</div>
                        )}
                        {!isVoice && <div className={`text-[10px] mt-0.5 ${mine ? "text-emerald-100 text-right" : "text-gray-400"}`}>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
                        {isVoice && <div className={`text-[10px] mt-0.5 ${mine ? "text-emerald-100 text-right" : "text-gray-400"}`}>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {isRecording ? (
                <div className="p-3 border-t flex gap-2 items-center bg-red-50">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-medium text-red-700">Recording… {recordDuration}s</span>
                  </div>
                  <Button variant="danger" onClick={stopRecording}>⏹ Stop & Send</Button>
                </div>
              ) : (
                <div className="p-2 sm:p-3 border-t flex gap-2 items-center bg-white">
                  <button
                    onClick={startRecording}
                    className="w-10 h-10 rounded-full bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center text-lg flex-shrink-0"
                    title="Hold to record voice note"
                  >
                    🎤
                  </button>
                  <Input
                    placeholder="Type a message..."
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                    className="flex-1"
                  />
                  <Button variant="gold" onClick={sendMessage} disabled={!newText.trim()} className="flex-shrink-0">Send</Button>
                </div>
              )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-6 text-gray-500">
                  <div>
                    <div className="text-5xl mb-3">👋</div>
                    <p className="text-sm">Select someone from the list to start chatting.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Active call overlay */}
      {callActive && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="text-sm text-gray-500 mb-2">In call with</div>
            {callActive.user.profilePicture ? (
              <img src={callActive.user.profilePicture} className="w-28 h-28 rounded-full object-cover mx-auto border-4 border-emerald-500 animate-pulse" alt="" />
            ) : (
              <div className="w-28 h-28 rounded-full bg-emerald-600 text-white flex items-center justify-center text-4xl font-bold mx-auto border-4 border-emerald-500 animate-pulse">
                {callActive.user.fullName.charAt(0)}
              </div>
            )}
            <h2 className="text-xl font-bold mt-4">{callActive.user.fullName}</h2>
            <p className="text-2xl font-mono text-emerald-600 mt-2">{formatDuration(callActive.duration)}</p>
            <p className="text-xs text-gray-500 mt-1">🔊 Connected • Free school call</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={endCall} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full font-semibold shadow-lg">
                📞 End Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
