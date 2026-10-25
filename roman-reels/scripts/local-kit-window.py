"""Small local window that prepares a plain kit for /intake_local (tkinter from the standard library).

Run on the laptop: pythonw roman-reels\\scripts\\local-kit-window.py
All checks and file work are in local_kit.py; the window only collects the topic and four MP4 paths.
"""
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import local_kit


class KitWindow:
    def __init__(self, root):
        self.root = root
        self.results = queue.Queue()
        self.busy = False
        root.protocol('WM_DELETE_WINDOW', self.close)
        root.title('Комплект для /intake_local')
        root.resizable(False, False)
        frame = ttk.Frame(root, padding=12)
        frame.grid()
        ttk.Label(frame, text='Тема комплекта').grid(row=0, column=0, sticky='w', pady=4)
        self.topic = tk.StringVar()
        ttk.Entry(frame, textvariable=self.topic, width=50).grid(row=0, column=1, columnspan=2, sticky='we')
        self.paths = {}
        for row, (role, label) in enumerate(local_kit.ROLES.items(), start=1):
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky='w', pady=4)
            self.paths[role] = tk.StringVar()
            ttk.Entry(frame, textvariable=self.paths[role], width=50, state='readonly').grid(row=row, column=1, sticky='we')
            ttk.Button(frame, text='Выбрать…', command=lambda r=role: self.choose(r)).grid(row=row, column=2, padx=(6, 0))
        self.button = ttk.Button(frame, text='Подготовить комплект', command=self.submit)
        self.button.grid(row=5, column=0, columnspan=3, pady=(10, 6))
        self.status = tk.StringVar(value=f'Папка входящих: {self.inbox_text()}')
        ttk.Label(frame, textvariable=self.status, wraplength=520, justify='left').grid(row=6, column=0, columnspan=3, sticky='w')
        self.result = tk.StringVar()
        ttk.Entry(frame, textvariable=self.result, width=80, state='readonly').grid(row=7, column=0, columnspan=3, sticky='we', pady=(6, 0))

    @staticmethod
    def inbox_text():
        try:
            return str(local_kit.configured_inbox())
        except (KeyError, ValueError) as error:
            return f'не настроена ({error})'

    def close(self):
        if self.busy:  # closing now would leave a half-copied temporary folder behind
            messagebox.showinfo('Подождите', 'Комплект ещё готовится. Окно можно закрыть после завершения.')
            return
        self.root.destroy()

    def choose(self, role):
        chosen = filedialog.askopenfilename(title=f'{local_kit.ROLES[role]}: выбери MP4',
                                            filetypes=[('Видео MP4', '*.mp4'), ('Все файлы', '*.*')])
        if chosen:  # cancel keeps the previous choice; nothing is created
            self.paths[role].set(chosen)

    def submit(self):
        topic = self.topic.get().strip()
        sources = {role: value.get() for role, value in self.paths.items()}
        errors = local_kit.check_form(topic, sources)
        if errors:
            messagebox.showwarning('Комплект не подготовлен', '\n'.join(errors))
            return
        self.busy = True
        self.button.state(['disabled'])
        self.result.set('')
        self.status.set('Копирую и проверяю SHA-256… Окно не закрывай.')
        threading.Thread(target=self.work, args=(topic, sources), daemon=True).start()
        self.root.after(200, self.poll)

    def work(self, topic, sources):
        try:
            self.results.put(('ok', local_kit.prepare(topic, sources)))
        except Exception as error:  # shown to the operator; the temporary folder is already removed
            self.results.put(('error', error))

    def poll(self):
        try:
            kind, value = self.results.get_nowait()
        except queue.Empty:
            self.root.after(200, self.poll)
            return
        self.busy = False
        self.button.state(['!disabled'])
        if kind == 'ok':
            self.status.set(f"{local_kit.DONE}\nКомплект {value['kit']}, тема {value['topicId']}.")
            self.result.set(value['path'])
            messagebox.showinfo('Готово', f"{local_kit.DONE}\n\n{value['path']}")
        else:
            self.status.set(f'Ошибка: {value}\nКомплект не создан, исходники не изменены.')
            messagebox.showerror('Комплект не подготовлен', f'{value}\n\nКомплект не создан, исходники не изменены.')


if __name__ == '__main__':
    window = tk.Tk()
    KitWindow(window)
    window.mainloop()
