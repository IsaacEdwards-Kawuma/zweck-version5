import api from "./client";

export async function listCrmContacts() {
  const { data } = await api.get("/crm/contacts");
  return data;
}

export async function getCrmContact(id) {
  const { data } = await api.get(`/crm/contacts/${id}`);
  return data;
}

export async function createCrmContact(payload) {
  const { data } = await api.post("/crm/contacts", payload);
  return data;
}

export async function updateCrmContact(id, payload) {
  const { data } = await api.patch(`/crm/contacts/${id}`, payload);
  return data;
}

export async function deleteCrmContact(id) {
  const { data } = await api.delete(`/crm/contacts/${id}`);
  return data;
}

export async function createCrmInteraction(contactId, payload) {
  const { data } = await api.post(`/crm/contacts/${contactId}/interactions`, payload);
  return data;
}

export async function deleteCrmInteraction(id) {
  const { data } = await api.delete(`/crm/interactions/${id}`);
  return data;
}

export async function createCrmReminder(contactId, payload) {
  const { data } = await api.post(`/crm/contacts/${contactId}/reminders`, payload);
  return data;
}

export async function updateCrmReminder(id, payload) {
  const { data } = await api.patch(`/crm/reminders/${id}`, payload);
  return data;
}

export async function deleteCrmReminder(id) {
  const { data } = await api.delete(`/crm/reminders/${id}`);
  return data;
}

export async function linkCrmDocument(contactId, payload) {
  const { data } = await api.post(`/crm/contacts/${contactId}/documents`, payload);
  return data;
}

export async function unlinkCrmDocument(linkId) {
  const { data } = await api.delete(`/crm/contact-documents/${linkId}`);
  return data;
}

export async function getCrmContactMeetings(contactId) {
  const { data } = await api.get(`/crm/contacts/${contactId}/meetings`);
  return data;
}
