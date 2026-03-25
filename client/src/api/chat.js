import api from "./client";

export async function listChatRooms() {
  const { data } = await api.get("/chat/rooms");
  return data?.rooms ?? [];
}

export async function getChatRoomSummary(roomId) {
  const { data } = await api.get(`/chat/rooms/${roomId}/summary`);
  return data?.room ?? null;
}

export async function listChatRoomMessages(roomId, { limit = 50, cursor = null } = {}) {
  const params = { limit, ...(cursor ? { cursor } : {}) };
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
