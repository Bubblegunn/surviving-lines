#!/usr/bin/env python3
"""Turns one run's stream-json log into the final.txt that grade.py reads.

Usage: python3 -I summarize.py <run.jsonl> [plugin-name]

Header lines, in this order:
  PLUGIN_NAME: <name>          only when a plugin name is given
  PLUGIN_LOADED: yes|no        yes when the init event lists that plugin
  PLUGIN_SKILLS: <names>, or none   the plugin's skills in the init event, without the name prefix
  SKILLS: <names>, or none     Skill tool calls
  SLASH: <commands>, or none   slash commands in the user messages
Then the commands run, the final answer, and a META line with the cost,
duration and turn count (null when the log has no result line).
grade.py removes every header line before the grader reads the answer, so
the header never reveals which arm produced it.
"""
import json
import re
import sys

COMMAND_NAME = re.compile(r"<command-name>([^<]+)</command-name>")


def plugin_listed(plugins, name):
    """True when the init event's plugin list names this plugin.

    Entries may be strings or objects with a name. "name@marketplace" counts
    as the name. When the init event has no plugin list at all, the quoted
    name is searched for in the event (the caller passes the whole line).
    """
    if not isinstance(plugins, list):
        return False
    for entry in plugins:
        if isinstance(entry, dict):
            entry = entry.get("name")
        if isinstance(entry, str) and entry.split("@", 1)[0] == name:
            return True
    return False


def plugin_skills(skills, plugin):
    """Unprefixed names of the skills in the init event that carry the plugin's prefix."""
    names = []
    for entry in skills if isinstance(skills, list) else []:
        if isinstance(entry, dict):
            entry = entry.get("name")
        if isinstance(entry, str) and entry.startswith(plugin + ":"):
            name = entry[len(plugin) + 1:]
            if name not in names:
                names.append(name)
    return names


def user_text(msg):
    """The text blocks of one user message, as one string."""
    content = (msg.get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "\n".join(
        str(block.get("text", ""))
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    )


def main(path, plugin=None):
    commands = []
    skills = []
    slash = []
    final = ""
    cost = duration = turns = None
    loaded = False
    own_skills = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            kind = msg.get("type")
            if kind == "system" and msg.get("subtype") == "init":
                if plugin is not None:
                    own_skills = plugin_skills(msg.get("skills"), plugin)
                    if "plugins" in msg:
                        loaded = loaded or plugin_listed(msg.get("plugins"), plugin)
                    else:
                        loaded = loaded or ('"%s"' % plugin) in line
            elif kind == "user":
                for name in COMMAND_NAME.findall(user_text(msg)):
                    if name not in slash:
                        slash.append(name)
            elif kind == "assistant":
                content = (msg.get("message") or {}).get("content") or []
                if not isinstance(content, list):
                    continue
                for block in content:
                    if not isinstance(block, dict) or block.get("type") != "tool_use":
                        continue
                    tool_input = block.get("input") or {}
                    if block.get("name") == "Skill":
                        skills.append(str(tool_input.get("skill")))
                    text = tool_input.get("command") or json.dumps(tool_input)
                    commands.append(block.get("name") + ": " + text[:700])
            elif kind == "result":
                final = msg.get("result") or ""
                cost = msg.get("total_cost_usd")
                duration = msg.get("duration_ms")
                turns = msg.get("num_turns")

    if plugin is not None:
        print("PLUGIN_NAME: " + plugin)
        print("PLUGIN_LOADED: " + ("yes" if loaded else "no"))
        print("PLUGIN_SKILLS: " + (", ".join(own_skills) if own_skills else "none"))
    print("SKILLS: " + (", ".join(skills) if skills else "none"))
    print("SLASH: " + (", ".join(slash) if slash else "none"))
    print("COMMANDS RUN:")
    for command in commands:
        print(" - " + command)
    print("FINAL ANSWER:")
    print(final)
    print("META cost=%s ms=%s turns=%s" % (cost, duration, turns))


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit("usage: summarize.py <run.jsonl> [plugin-name]")
    main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
