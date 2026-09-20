#!/usr/bin/env python3
"""varco-deliver.py — la prossima card parte per il dev (DELIVERY §3.1). La mano della skill `varco-deliver`,
che sta nel PRODOTTO: la lancia il dev dalla sua sessione (Claude Code o Conductor), via `.varco/`.

  python3 .claude/skills/varco-deliver/scripts/varco-deliver.py [F04b]

Senza ID: la prima card ready dei "Prossimi tre" di STATO.md (o l'unica ready). WIP=1.
Mette la card in volo, scrive nel LOG, committa il processo e stampa il prompt con i path.
È l'unico modo in cui il dev tocca il processo.
"""
import os, sys, re, glob, argparse, datetime, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
PROD = os.path.realpath(os.path.join(HERE, '..', '..', '..', '..'))   # la repo del prodotto


def process_dir():
    """`.varco/` è il processo, accanto al prodotto. In un worktree (Conductor, o `git worktree add`
    a mano) è ignorato e quindi assente: lo ricolleghiamo al checkout principale. Conductor lo fa
    dal suo setup script; da terminale lo facciamo qui, una volta."""
    here = os.path.join(PROD, '.varco')
    if os.path.exists(here):
        return os.path.realpath(here)
    common = subprocess.run(['git', '-C', PROD, 'rev-parse', '--git-common-dir'],
                            capture_output=True, text=True).stdout.strip()
    if not common:
        sys.exit('✗ non sei in una repo git: apri la sessione dalla repo del prodotto')
    common = common if os.path.isabs(common) else os.path.join(PROD, common)
    target = os.path.join(os.path.dirname(os.path.realpath(common)), '.varco')
    if not os.path.isdir(target):
        sys.exit(f'✗ processo non trovato: né {here} né {target}. È un progetto Varco?')
    os.symlink(target, here)
    print(f'· .varco ricollegato al checkout principale ({target})')
    return target


sys.path.insert(0, os.path.join(process_dir(), '.claude', 'lib'))
import varco as v


def resolve():
    ready = {v.cid_of(f): f for f in glob.glob(os.path.join(v.TODO, '*.md')) if v.status_of(f) == 'ready' and not v.is_design(v.cid_of(f))}
    if not ready:
        sys.exit('✗ nessuna card ready in .varco/docs/cards/todo/ — il PM deve scriverne una (varco-card) o metterla ready')
    stato = open(os.path.join(v.ROOT, 'STATO.md'), encoding='utf-8').read()
    sec = re.search(r'^## Prossimi tre\n(.*?)(?=^## |\Z)', stato, re.M | re.S)
    for cid in re.findall(r'\bF\d+[a-z]?\b', sec.group(1) if sec else ''):
        if cid in ready:
            return cid
    if len(ready) == 1:
        return next(iter(ready))
    sys.exit(f'✗ più card ready e nessuna nei "Prossimi tre" di STATO.md: {", ".join(sorted(ready))} — indica l\'ID')


def prompt(cid, path, s):
    cyc, gate, br, des = (v.field(s, k) for k in ('cycle', 'gate', 'branch', 'design'))
    mock = '—' if des in ('none', 'required', '?') else f'.varco/docs/design/{des}/ + .varco/docs/design/DESIGN_SYSTEM.md'
    cold = ("COLD: usa la skill `varco-plan` (testata Varco + task, un file solo, ogni task assegnato per nome a "
            "`backend` o `frontend`); poi il subagent `pm-reviewer` lo rivede: APPROVE → esegui senza aspettare; "
            "STOP \"Per il PM\" → fermati e consegna solo quella lista. Esecuzione senza review per task "
            "(self-check dell'implementer): la review è una, sul branch. Strumenti: AGENTS.md §Harness.")
    hot = "HOT: la card è il piano — esecuzione diretta con l'agente di zona (`backend` o `frontend`)."
    return f"""
── Flusso dev ───────────────────────────────────────────────────────────────────────────
Card: .varco/{os.path.relpath(path, v.ROOT)} · Ciclo: {cyc} · Gate: {gate}
Branch: {br} da origin/main (git fetch -q origin && git checkout -b {br} origin/main). Non tocchi `main`.
Mockup e design system: {mock}
{cold if cyc == 'COLD' else hot}
Sempre: a inizio task esegui ciò che AGENTS.md §Harness prescrive (YAGNI; scorciatoie marcate `ponytail:`);
leggi solo gli ADR (.varco/docs/adr/) e i mockup che la card indica; le verifiche di §Stack verdi prima della PR;
gli e2e non li lanci. `.varco/` non lo tocchi: è del PM (questo script è l'unica eccezione).
PR a flusso finito con `gh pr create` (AC come checklist, evidenza dall'artifact CI nel body, "Note per il
reviewer" con i differiti in forma registro). Poi review con l'agente `reviewer` sul branch; fix; giro 2 =
verifica: al `reviewer` la sua lista + diff di fix, verdetto per riga, senza rilanciare i check (max 2 giri).
Merge: se CI verde e NESSUNA nota aperta per il PM → `gh pr merge --squash --delete-branch`. Se hai
lasciato dubbi nelle note → FERMATI: il PM risponde nella PR, poi mergi. Chiudi con: "PR #N mergiata"
(o "in attesa del PM su: …") — il numero serve al PM per varco-close.
─────────────────────────────────────────────────────────────────────────────────────────"""


p = argparse.ArgumentParser()
p.add_argument('id', nargs='?'); p.add_argument('--date', default=datetime.date.today().isoformat())
a = p.parse_args()
cid = v.norm(a.id) if a.id else resolve()
if v.is_design(cid):
    sys.exit(f'✗ {cid} è una card di design: è del PM (varco-design), non parte per il dev')
path = v.find(cid)
busy = [os.path.basename(f) for f in glob.glob(os.path.join(v.TODO, '*.md'))
        if v.status_of(f) in ('in_progress', 'review') and not v.is_design(v.cid_of(f))]
if busy:
    sys.exit(f'✗ WIP=1: già in corso {", ".join(busy)} — il PM la chiude prima (varco-close)')
s = open(path, encoding='utf-8').read()
if v.field(s, 'status') not in ('ready', 'todo'):
    sys.exit(f'✗ {cid} non è ready/todo')
if v.field(s, 'design') == 'required':
    sys.exit(f'✗ {cid} ha design: required — parcheggiata finché non ha i mockup (varco-design, del PM)')
s = v.set_field(s, 'status', 'in_progress')
s = v.set_field(s, 'started', v.now())            # finestra della card: la legge chi misura (plugins/monitor)
open(path, 'w', encoding='utf-8').write(s)
v.log(f"- {a.date} · apertura · **{cid} {v.title_of(s)}** · {v.field(s, 'cycle')} · branch {v.field(s, 'branch')}")
print(f"✓ {cid} in_progress · {v.field(s, 'cycle')} · branch {v.field(s, 'branch')} · riga in docs/LOG.md")
v.commit(f'{cid} in volo')
print(prompt(cid, path, s))
