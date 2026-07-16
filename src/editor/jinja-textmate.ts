import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import { Registry, type IGrammar, type IRawGrammar, type IRawTheme, type StateStack } from 'vscode-textmate'
import type * as monaco from 'monaco-editor'

import jinjaRawGrammar from './jinja.tmLanguage.json'
import onigWasmUrl from 'vscode-oniguruma/release/onig.wasm?url'

let registry: Registry | null = null
let grammar: IGrammar | null = null
let wasmLoaded = false

async function ensureWasmLoaded(): Promise<void> {
  if (wasmLoaded) return

  const response = await fetch(onigWasmUrl)
  const wasmBytes = await response.arrayBuffer()

  await loadWASM(wasmBytes)
  wasmLoaded = true
}

function createRegistry(): Registry {
  const theme: IRawTheme = {
    name: 'vs-dark',
    settings: [
      {
        settings: {
          foreground: '#D4D4D4',
          background: '#1E1E1E',
        },
      },
      {
        scope: 'comment',
        settings: {
          foreground: '#6A9955',
          fontStyle: 'italic',
        },
      },
      {
        scope: 'keyword.control.jinja',
        settings: {
          foreground: '#569CD6',
          fontStyle: 'bold',
        },
      },
      {
        scope: 'entity.other.jinja.delimiter.tag',
        settings: {
          foreground: '#FFD700',
        },
      },
      {
        scope: 'variable.entity.other.jinja.delimiter',
        settings: {
          foreground: '#FFD700',
        },
      },
      {
        scope: 'entity.other.jinja.delimiter.comment',
        settings: {
          foreground: '#6A9955',
        },
      },
      {
        scope: 'variable.other.jinja',
        settings: {
          foreground: '#9CDCFE',
        },
      },
      {
        scope: 'variable.language.jinja',
        settings: {
          foreground: '#569CD6',
        },
      },
      {
        scope: 'constant.language.jinja',
        settings: {
          foreground: '#569CD6',
        },
      },
      {
        scope: 'string.quoted.double.jinja',
        settings: {
          foreground: '#CE9178',
        },
      },
      {
        scope: 'string.quoted.single.jinja',
        settings: {
          foreground: '#CE9178',
        },
      },
      {
        scope: 'keyword.operator',
        settings: {
          foreground: '#D4D4D4',
        },
      },
      {
        scope: 'punctuation',
        settings: {
          foreground: '#D4D4D4',
        },
      },
      {
        scope: 'variable.other.jinja.filter',
        settings: {
          foreground: '#C586C0',
        },
      },
      {
        scope: 'variable.other.jinja.attribute',
        settings: {
          foreground: '#9CDCFE',
        },
      },
      {
        scope: 'variable.other.jinja.block',
        settings: {
          foreground: '#4EC9B0',
        },
      },
    ],
  }

  return new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    theme,
    loadGrammar: async (_scopeName: string) => {
      return null
    },
  })
}

async function ensureGrammar(): Promise<IGrammar> {
  if (grammar) return grammar

  await ensureWasmLoaded()
  registry = createRegistry()

  const rawGrammar = {
    ...jinjaRawGrammar,
    repository: jinjaRawGrammar.repository || {},
    scopeName: jinjaRawGrammar.scopeName,
  } as unknown as IRawGrammar

  grammar = await registry.addGrammar(rawGrammar)

  if (!grammar) {
    throw new Error('Failed to load Jinja grammar')
  }

  return grammar
}

class JinjaState implements monaco.languages.IState {
  ruleStack: StateStack | null

  constructor(ruleStack: StateStack | null) {
    this.ruleStack = ruleStack
  }

  clone(): JinjaState {
    return new JinjaState(this.ruleStack ? this.ruleStack.clone() : null)
  }

  equals(other: monaco.languages.IState): boolean {
    if (!(other instanceof JinjaState)) return false
    return this.ruleStack === other.ruleStack || (this.ruleStack !== null && other.ruleStack !== null && this.ruleStack.equals(other.ruleStack))
  }
}

export async function createJinjaTokensProvider(): Promise<monaco.languages.TokensProvider> {
  const g = await ensureGrammar()

  return {
    getInitialState: (): JinjaState => {
      return new JinjaState(null)
    },

    tokenize: (line: string, state: JinjaState): monaco.languages.ILineTokens => {
      const result = g.tokenizeLine(line, state.ruleStack)

      const tokens: monaco.languages.IToken[] = []
      for (let i = 0; i < result.tokens.length; i++) {
        const token = result.tokens[i]
        const startIndex = token.startIndex
        const endIndex = i + 1 < result.tokens.length ? result.tokens[i + 1].startIndex : line.length
        const scope = token.scopes.length > 0 ? token.scopes[token.scopes.length - 1] : ''

        tokens.push({
          startIndex,
          scopes: scope,
        })
      }

      return {
        tokens,
        endState: new JinjaState(result.ruleStack),
      }
    },
  }
}