import api from "./client";

export async function getMyChatCrypto() {
  const { data } = await api.get("/chat/me/crypto");
  return data;
}

export async function putMyChatPublicKey(publicKeyJwk) {
  const { data } = await api.put("/chat/me/crypto", { publicKeyJwk });
  return data;
}

export async function getUserChatPublicKey(userId) {
  const { data } = await api.get(`/chat/users/${userId}/public-key`);
  return data;
}

export async function listChatRooms({ includeArchived = false } = {}) {
  const { data } = await api.get("/chat/rooms", {
    params: includeArchived ? { includeArchived: "1" } : {}
  });
  return data?.rooms ?? [];
}

export async function getChatRoomSummary(roomId) {
  const { data } = await api.get(`/chat/rooms/${roomId}/summary`);
  return data?.room ?? null;
}

export async function listChatRoomMessages(roomId, { limit = 50, cursor = null, thread = null } = {}) {
  const params = { limit, ...(cursor ? { cursor } : {}) };
  if (thread != null && thread !== "main") params.thread = String(thread);
  const { data } = await api.get(`/chat/rooms/${roomId}/messages`, { params });
  return data;
}

export async function searchChatMessages(roomId, { q, limit = 30, cursor = null } = {}) {
  const params = { q, limit, ...(cursor ? { cursor } : {}) };
  const { data } = await api.get(`/chat/rooms/${roomId}/messages/search`, { params });
  return data;
}

export async function listChatRoomMembers(roomId) {
  const { data } = await api.get(`/chat/rooms/${roomId}/members`);
  return data;
}

export async function addChatRoomMember(roomId, email) {
  const { data } = await api.post(`/chat/rooms/${roomId}/members`, { email });
  return data;
}

export async function removeChatRoomMember(roomId, userId) {
  const { data } = await api.delete(`/chat/rooms/${roomId}/members/${userId}`);
  return data;
}

export async function getChatReadReceipts(roomId, messageId) {
  const { data } = await api.get(`/chat/rooms/${roomId}/read-receipts`, {
    params: { messageId }
  });
  return data;
}

export async function uploadChatAttachment(roomId, file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post(`/chat/rooms/${roomId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function patchChatMessage(roomId, messageId, body) {
  const { data } = await api.patch(`/chat/rooms/${roomId}/messages/${messageId}`, { body });
  return data;
}

export async function deleteChatMessage(roomId, messageId) {
  const { data } = await api.delete(`/chat/rooms/${roomId}/messages/${messageId}`);
  return data;
}

export async function toggleChatReaction(roomId, messageId, emoji) {
  const { data } = await api.post(`/chat/rooms/${roomId}/messages/${messageId}/reactions`, { emoji });
  return data;
}

export async function createDmRoomByEmail({ otherEmail }) {
  const { data } = await api.post("/chat/rooms/dm", { otherEmail });
  return data;
}

export async function createGroupRoom({ title, memberEmails }) {
  const payload = { title, ...(Array.isArray(memberEmails) ? { memberEmails } : {}) };
  const { data } = await api.post("/chat/rooms/group", payload);
  return data;
}

export async function listChatUsers() {
  const { data } = await api.get("/chat/users");
  return data?.users ?? [];
}

export async function markAllChatRoomsRead() {
  const { data } = await api.post("/chat/rooms/read-all");
  return data;
}

export async function setChatRoomPin(roomId, messageId) {
  const { data } = await api.patch(`/chat/rooms/${roomId}/pin`, { messageId });
  return data;
}

export async function getChatRoomPresence(roomId) {
  const { data } = await api.get(`/chat/rooms/${roomId}/presence`);
  return data;
}

export async function archiveChatRoom(roomId) {
  const { data } = await api.post(`/chat/rooms/${roomId}/archive`);
  return data;
}

export async function unarchiveChatRoom(roomId) {
  const { data } = await api.post(`/chat/rooms/${roomId}/unarchive`);
  return data;
}

export async function clearChatHistory(roomId) {
  const { data } = await api.post(`/chat/rooms/${roomId}/clear`);
  return data;
}

export async function leaveChatRoom(roomId) {
  const { data } = await api.delete(`/chat/rooms/${roomId}/membership`);
  return data;
}

export async function listChatBlocks() {
  const { data } = await api.get("/chat/blocks");
  return data?.blocks ?? [];
}

export async function blockChatUser(userId) {
  const { data } = await api.post("/chat/blocks", { userId });
  return data;
}

export async function unblockChatUser(userId) {
  const { data } = await api.delete(`/chat/blocks/${userId}`);
  return data;
}

export async function patchChatMemberMe(roomId, body) {
  const { data } = await api.patch(`/chat/rooms/${roomId}/members/me`, body);
  return data;
}

export async function patchChatRoomSettings(roomId, body) {
  const { data } = await api.patch(`/chat/rooms/${roomId}/settings`, body);
  return data;
}

export async function downloadChatExport(roomId, { format = "txt", from = null, to = null } = {}) {
  const params = { format };
  if (from) params.from = from;
  if (to) params.to = to;
  const { data } = await api.get(`/chat/rooms/${roomId}/export`, { params, responseType: "blob" });
  const ext = format === "csv" ? "csv" : "txt";
  const name = `chat-export-${roomId}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function forwardChatMessage(roomId, messageId, targetRoomId) {
  const { data } = await api.post(`/chat/rooms/${roomId}/messages/${messageId}/forward`, {
    targetRoomId
  });
  return data;
}
