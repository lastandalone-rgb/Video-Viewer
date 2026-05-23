/**
 * Unit tests for pure utility functions extracted from main.js (Electron主程序)
 * 測試範圍：字幕轉換、時間格式化、路徑處理、資料庫操作邏輯
 */

import { describe, it, expect } from 'vitest'

// ── 從 main.js 抽取的純函式，直接在此重現以做單元測試 ──────────────────────

/**
 * 將 SRT 字幕格式轉換為 WebVTT 格式
 */
function srtToVtt(srt) {
  const header = 'WEBVTT\n\n'
  const body = srt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return header + body
}

/**
 * 將 ASS/SSA 字幕格式轉換為 WebVTT 格式
 */
function assToVtt(ass) {
  const lines = ass.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let vtt = 'WEBVTT\n\n'
  let index = 1
  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue
    const parts = line.split(',')
    if (parts.length < 10) continue
    const startRaw = parts[1].trim()
    const endRaw   = parts[2].trim()
    const text = parts.slice(9).join(',')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/g, '\n')
      .trim()
    if (!text) continue

    const toVttTime = (t) => {
      const [h, m, sc] = t.split(':')
      const [s, cs] = (sc || '0.0').split('.')
      const ms = (parseInt(cs || 0) * 10).toString().padStart(3, '0')
      return `${h.padStart(2,'0')}:${m.padStart(2,'0')}:${s.padStart(2,'0')}.${ms}`
    }

    vtt += `${index++}\n${toVttTime(startRaw)} --> ${toVttTime(endRaw)}\n${text}\n\n`
  }
  return vtt
}

/**
 * 影片副檔名集合
 */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov'])

/**
 * 格式化秒數為 mm:ss 字串（從 VideoPlayer.jsx 抽取）
 */
function formatTime(time) {
  if (isNaN(time)) return '00:00'
  const mins = Math.floor(time / 60)
  const secs = Math.floor(time % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * 音量邊界處理（從 VideoPlayer.jsx 抽取）
 */
function clampVolume(volume, delta) {
  let newVolume = volume + delta
  if (newVolume > 1) newVolume = 1
  if (newVolume < 0) newVolume = 0
  return newVolume
}

/**
 * 移動檔案目標路徑計算（模擬 move-file IPC 邏輯）
 */
function calcTargetPath(sourcePath, targetDir) {
  const sep = sourcePath.includes('\\') ? '\\' : '/'
  const basename = sourcePath.split(sep).pop()
  return targetDir.replace(/[/\\]$/, '') + sep + basename
}

/**
 * 進度百分比計算
 */
function calcProgress(currentTime, duration) {
  if (!duration || !isFinite(duration) || duration === 0) return 0
  return (currentTime / duration) * 100
}

// ─────────────────────────────────────────────────────────────────────────────

describe('srtToVtt - SRT 字幕轉換', () => {
  it('應加上 WEBVTT 標頭', () => {
    const result = srtToVtt('')
    expect(result).toMatch(/^WEBVTT/)
  })

  it('應將 SRT 時間戳記中的逗號轉為點', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello World'
    const result = srtToVtt(srt)
    expect(result).toContain('00:00:01.000 --> 00:00:03.500')
  })

  it('應正確保留多筆字幕內容', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Line one',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      'Line two',
    ].join('\n')
    const result = srtToVtt(srt)
    expect(result).toContain('Line one')
    expect(result).toContain('Line two')
  })

  it('應將 Windows 換行符 \\r\\n 正規化', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n'
    const result = srtToVtt(srt)
    expect(result).toContain('00:00:01.000 --> 00:00:02.000')
    expect(result).toContain('Hello')
  })

  it('空字串應只有標頭', () => {
    const result = srtToVtt('')
    expect(result).toBe('WEBVTT\n\n')
  })
})

describe('assToVtt - ASS 字幕轉換', () => {
  const sampleAss = [
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello World',
    'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\i1}Italic text{\\i0}',
  ].join('\n')

  it('應加上 WEBVTT 標頭', () => {
    const result = assToVtt(sampleAss)
    expect(result).toMatch(/^WEBVTT/)
  })

  it('應正確解析 Dialogue 行的文字內容', () => {
    const result = assToVtt(sampleAss)
    expect(result).toContain('Hello World')
  })

  it('應移除 ASS 格式標籤 {}', () => {
    const result = assToVtt(sampleAss)
    expect(result).not.toMatch(/\{[^}]*\}/)
    expect(result).toContain('Italic text')
  })

  it('應正確轉換時間格式 H:MM:SS.cc -> HH:MM:SS.ccc', () => {
    const result = assToVtt(sampleAss)
    expect(result).toContain('00:00:01.000 --> 00:00:03.000')
  })

  it('應忽略非 Dialogue 行', () => {
    const result = assToVtt(sampleAss)
    expect(result).not.toContain('[Events]')
    expect(result).not.toContain('Format:')
  })

  it('空輸入應只有標頭', () => {
    const result = assToVtt('')
    expect(result).toBe('WEBVTT\n\n')
  })
})

describe('VIDEO_EXTENSIONS - 影片副檔名過濾', () => {
  it('應接受 .mp4', () => expect(VIDEO_EXTENSIONS.has('.mp4')).toBe(true))
  it('應接受 .mkv', () => expect(VIDEO_EXTENSIONS.has('.mkv')).toBe(true))
  it('應接受 .webm', () => expect(VIDEO_EXTENSIONS.has('.webm')).toBe(true))
  it('應接受 .avi', () => expect(VIDEO_EXTENSIONS.has('.avi')).toBe(true))
  it('應接受 .mov', () => expect(VIDEO_EXTENSIONS.has('.mov')).toBe(true))
  it('應拒絕 .txt', () => expect(VIDEO_EXTENSIONS.has('.txt')).toBe(false))
  it('應拒絕 .jpg', () => expect(VIDEO_EXTENSIONS.has('.jpg')).toBe(false))
  it('應拒絕 .pdf', () => expect(VIDEO_EXTENSIONS.has('.pdf')).toBe(false))
  it('應拒絕大寫 .MP4（區分大小寫）', () => expect(VIDEO_EXTENSIONS.has('.MP4')).toBe(false))
})

describe('formatTime - 時間格式化', () => {
  it('0 秒應顯示 00:00', () => {
    expect(formatTime(0)).toBe('00:00')
  })

  it('65 秒應顯示 01:05', () => {
    expect(formatTime(65)).toBe('01:05')
  })

  it('3661 秒應顯示 61:01', () => {
    expect(formatTime(3661)).toBe('61:01')
  })

  it('NaN 應顯示 00:00', () => {
    expect(formatTime(NaN)).toBe('00:00')
  })

  it('小數秒數應無條件捨去', () => {
    expect(formatTime(90.9)).toBe('01:30')
  })

  it('9 秒應補零為 00:09', () => {
    expect(formatTime(9)).toBe('00:09')
  })
})

describe('clampVolume - 音量邊界控制', () => {
  it('音量在 0.5，增加 0.1 應為 0.6', () => {
    expect(clampVolume(0.5, 0.1)).toBeCloseTo(0.6)
  })

  it('音量在 0.95，增加 0.1 應不超過 1.0', () => {
    expect(clampVolume(0.95, 0.1)).toBe(1)
  })

  it('音量在 0.05，減少 0.1 應不低於 0', () => {
    expect(clampVolume(0.05, -0.1)).toBe(0)
  })

  it('音量在 1.0，增加任意值應保持 1.0', () => {
    expect(clampVolume(1.0, 0.5)).toBe(1)
  })

  it('音量在 0.0，減少任意值應保持 0', () => {
    expect(clampVolume(0.0, -0.5)).toBe(0)
  })
})

describe('calcTargetPath - 檔案搬移目標路徑計算', () => {
  it('Windows 路徑應正確計算目標路徑', () => {
    const result = calcTargetPath('C:\\Videos\\movie.mp4', 'C:\\Videos\\Action')
    expect(result).toBe('C:\\Videos\\Action\\movie.mp4')
  })

  it('Unix 路徑應正確計算目標路徑', () => {
    const result = calcTargetPath('/home/user/movie.mp4', '/home/user/Action')
    expect(result).toBe('/home/user/Action/movie.mp4')
  })

  it('目標目錄尾部有斜線仍應正確', () => {
    const result = calcTargetPath('/home/user/movie.mp4', '/home/user/Action/')
    expect(result).toBe('/home/user/Action/movie.mp4')
  })

  it('應保留原始檔名（含中文）', () => {
    const result = calcTargetPath('C:\\影片\\精彩片段.mkv', 'D:\\備份')
    expect(result).toContain('精彩片段.mkv')
  })
})

describe('calcProgress - 播放進度百分比', () => {
  it('currentTime=30, duration=100 應為 30%', () => {
    expect(calcProgress(30, 100)).toBe(30)
  })

  it('currentTime=0 應為 0%', () => {
    expect(calcProgress(0, 100)).toBe(0)
  })

  it('currentTime=duration 應為 100%', () => {
    expect(calcProgress(100, 100)).toBe(100)
  })

  it('duration=0 應為 0（避免除以零）', () => {
    expect(calcProgress(50, 0)).toBe(0)
  })

  it('duration=Infinity 應為 0（防止串流時的無效值）', () => {
    expect(calcProgress(50, Infinity)).toBe(0)
  })

  it('duration=NaN 應為 0', () => {
    expect(calcProgress(50, NaN)).toBe(0)
  })
})

describe('資料庫邏輯 - 集合去重', () => {
  it('相同路徑的資料夾不應重複加入', () => {
    const folders = [{ path: 'C:\\Movies', name: 'Movies' }]
    const newPath = 'C:\\Movies'
    const alreadyExists = folders.find(f => f.path === newPath)
    expect(alreadyExists).toBeTruthy()
  })

  it('不同路徑的資料夾可以加入', () => {
    const folders = [{ path: 'C:\\Movies', name: 'Movies' }]
    const newPath = 'C:\\Videos'
    const alreadyExists = folders.find(f => f.path === newPath)
    expect(alreadyExists).toBeFalsy()
  })
})

describe('設定合併邏輯', () => {
  it('saveSettings 應使用 spread 合併而非覆蓋', () => {
    const existing = { defaultViewMode: 'grid', gridItemsPerPage: 48, browserUrl: 'https://google.com' }
    const updates = { defaultViewMode: 'list' }
    const merged = { ...existing, ...updates }
    expect(merged.defaultViewMode).toBe('list')
    expect(merged.gridItemsPerPage).toBe(48)
    expect(merged.browserUrl).toBe('https://google.com')
  })

  it('設定預設值應正確套用', () => {
    const defaultSettings = { defaultViewMode: 'grid', cachePath: '', browserUrl: 'https://www.google.com' }
    const dbSettings = { defaultViewMode: 'theatre' }
    const merged = { ...defaultSettings, ...dbSettings }
    expect(merged.defaultViewMode).toBe('theatre')
    expect(merged.browserUrl).toBe('https://www.google.com')
  })
})

describe('最愛清單去重邏輯', () => {
  it('相同 path 的項目不應重複加入最愛', () => {
    const favorites = [{ path: 'C:\\movie.mp4', type: 'video' }]
    const newItem = { path: 'C:\\movie.mp4', type: 'video' }
    const exists = favorites.find(f => f.path === newItem.path)
    expect(exists).toBeTruthy()
  })

  it('移除最愛應正確過濾', () => {
    const favorites = [
      { path: 'C:\\a.mp4', type: 'video' },
      { path: 'C:\\b.mp4', type: 'video' },
    ]
    const afterRemove = favorites.filter(f => f.path !== 'C:\\a.mp4')
    expect(afterRemove).toHaveLength(1)
    expect(afterRemove[0].path).toBe('C:\\b.mp4')
  })

  it('移除不存在的項目不應影響清單', () => {
    const favorites = [{ path: 'C:\\a.mp4', type: 'video' }]
    const afterRemove = favorites.filter(f => f.path !== 'C:\\nonexistent.mp4')
    expect(afterRemove).toHaveLength(1)
  })
})
