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

