import api from "./client";

export async function listChatRooms() {
  const { data } = await api.get("/chat/rooms");
  return data?.rooms ?? [];
}

export async function listChatRoomMessages(roomId, { limit = 50, cursor = null } = {}) {
  const params = { limit, ...(cursor ? { cursor } : {}) };
  const { data } = await api.get(`/chat/rooms/${roomId}/messages`, { params });
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

