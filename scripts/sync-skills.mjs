#!/usr/bin/env node
import { cpSync, rmSync } from 'node:fs';

rmSync('.claude/skills', { recursive: true, force: true });

cpSync('.agents/skills', '.claude/skills', { recursive: true });
