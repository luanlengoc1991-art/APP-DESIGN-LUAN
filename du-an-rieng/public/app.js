const STORAGE_KEY = "so-tay-rieng.notes";

const form = document.querySelector("#composer");
const draft = document.querySelector("#draft");
const list = document.querySelector("#notes");
const clearButton = document.querySelector("#clear");
const status = document.querySelector("#status");

function readNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note) =>
        note &&
        typeof note.id === "string" &&
        typeof note.text === "string" &&
        typeof note.createdAt === "string",
    );
  } catch {
    return [];
  }
}

function writeNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function render() {
  const notes = readNotes();
  list.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement("li");
      item.className = "note";

      const body = document.createElement("div");
      const text = document.createElement("p");
      text.textContent = note.text;
      const time = document.createElement("time");
      time.dateTime = note.createdAt;
      time.textContent = new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(note.createdAt));
      body.append(text, time);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Xoá";
      remove.addEventListener("click", () => {
        writeNotes(readNotes().filter((entry) => entry.id !== note.id));
        render();
      });

      item.append(body, remove);
      return item;
    }),
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = draft.value.trim();
  if (!text) return;
  const notes = readNotes();
  notes.unshift({
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString(),
  });
  writeNotes(notes.slice(0, 50));
  draft.value = "";
  render();
});

clearButton.addEventListener("click", () => {
  if (readNotes().length === 0) return;
  writeNotes([]);
  render();
});

async function loadStatus() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    const when = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(body.time));
    status.textContent = `Đã kết nối ${body.project} lúc ${when}.`;
  } catch {
    status.textContent = "Chưa kết nối được máy chủ.";
  }
}

render();
loadStatus();
