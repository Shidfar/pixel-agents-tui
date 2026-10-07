#!/usr/bin/env python3
"""Drive an interactive claude session in a real pty and log its output.
usage: drive.py <cols> <rows> <log> <cwd> <steps.json> -- <claude args...>
steps: ["wait", secs] | ["send", text] | ["until", substring, timeout_secs]"""
import fcntl, json, os, pty, select, signal, struct, sys, termios, time
argv = sys.argv[1:]
sep = argv.index('--')
cols, rows, logp, cwd, stepsj = int(argv[0]), int(argv[1]), argv[2], argv[3], argv[4]
cargs = argv[sep + 1:]
steps = json.loads(stepsj)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.environ['TERM'] = os.environ.get('SHOT_TERM', 'xterm-256color')
    os.environ['COLORTERM'] = 'truecolor'
    os.execvp('claude', ['claude'] + cargs)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
log = open(logp, 'wb')
seen = b''
REPLIES = [(b'\x1b[c', b'\x1b[?62;22c'), (b'\x1b[>0q', b'\x1bP>|xterm(390)\x1b\\'), (b'\x1b[?u', b'\x1b[?0u'), (b'\x1b[6n', b'\x1b[1;1R')]
def pump(secs):
    global seen
    end = time.time() + secs
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], max(0, min(0.05, end - time.time())))
        if fd in r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                return False
            if not data:
                return False
            log.write(data); log.flush()
            tail = seen[-16:] + data
            for q, a in REPLIES:
                if q in tail:
                    os.write(fd, a)
            seen = (seen + data)[-200000:]
    return True
for step in steps:
    kind = step[0]
    if kind == 'wait':
        if not pump(step[1]): break
    elif kind == 'send':
        data = step[1].encode().decode('unicode_escape').encode('latin-1')
        if data.startswith(b'\x1b') or len(data) == 1:
            os.write(fd, data); pump(0.05)
        else:
            for ch in data:
                os.write(fd, bytes([ch])); pump(0.02)
    elif kind == 'until':
        end = time.time() + step[2]
        mark = len(seen)
        while time.time() < end and step[1].encode() not in seen[-60000:]:
            if not pump(0.2): break
log.close()
try:
    os.kill(pid, signal.SIGTERM); time.sleep(0.5); os.kill(pid, signal.SIGKILL)
except ProcessLookupError:
    pass
