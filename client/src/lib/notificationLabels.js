/** Short label for notification `type` (server string). */
export function notificationKindLabel(type) {
  if (!type) return null;
  switch (String(type)) {
    case "TASK_ASSIGNED":
      return "Task assigned";
    case "MEETING_REMINDER":
      return "Meeting reminder";
    case "MEETING_INVITE":
      return "Meeting invite";
    case "FILE_SHARED":
      return "File shared";
    default:
      return null;
  }
}
