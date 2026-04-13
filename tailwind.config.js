/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // === 電脳世界ベースカラー（サーフェス階層） ===
        cyber: {
          bg: '#0a0e27',        // Surface 0: 最深部背景
          900: '#0d1117',       // Surface 1: カード背景
          800: '#101b2e',       // Surface 1.5: セクション背景
          700: '#1a2744',       // Surface 2: パネル/入力エリア
          600: '#243555',       // ボーダー暗
          500: '#2d4a7a',       // ボーダー中
          400: '#3d5a8a',       // ボーダー明
        },
        // === メインブルー ===
        navi: {
          DEFAULT: '#0070ec',   // メインUI色
          light: '#3cbcfc',     // ハイライト
          glow: '#00e8d8',      // グロー/アクセント
          dark: '#003d8f',      // 押下状態
        },
        // === ネオングリーン（成功/アクティブ） ===
        exe: {
          green: '#00ff41',     // ネオングリーン
          greenDim: '#00cc33',  // 落ち着いたグリーン
          yellow: '#ffd700',    // エグゼイエロー（アクセント）
          yellowSoft: '#fce4a0',// ソフトイエロー
        },
        // === ステータスカラー ===
        alert: {
          red: '#ff3333',       // エラー/敵
          purple: '#9b30ff',    // レア/シークレット
          orange: '#ff8c00',    // 警告
        },
        // === テキストカラー ===
        txt: {
          primary: '#e0e0e0',   // オフホワイト（OLED対策・可読性向上）
          secondary: '#b0e0ff',
          muted: '#6888a8',
          accent: '#00e8d8',
          bright: '#ffffff',    // 強調用の純白
        },
      },
      fontFamily: {
        // 装飾用（ヘッダー/ラベル）
        pixel: ['"Press Start 2P"', '"DotGothic16"', 'monospace'],
        // メインUI（等幅）
        mono: ['"Share Tech Mono"', '"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        // 本文（可読性重視）
        body: ['"Noto Sans JP"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        'neon-blue': '0 0 5px #0070ec, 0 0 20px rgba(0,112,236,0.35), 0 0 40px rgba(0,112,236,0.15)',
        'neon-cyan': '0 0 5px #00e8d8, 0 0 20px rgba(0,232,216,0.35), 0 0 40px rgba(0,232,216,0.15)',
        'neon-green': '0 0 5px #00ff41, 0 0 20px rgba(0,255,65,0.35), 0 0 40px rgba(0,255,65,0.15)',
        'neon-red': '0 0 5px #ff3333, 0 0 20px rgba(255,51,51,0.35)',
        'neon-yellow': '0 0 5px #ffd700, 0 0 20px rgba(255,215,0,0.35)',
        'pet-frame': '0 0 10px rgba(0,112,236,0.25), inset 0 0 20px rgba(0,112,236,0.06)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'jack-in': 'jack-in 1.2s ease-in-out',
        'data-stream': 'data-stream 3s linear infinite',
        'neon-flicker': 'neon-flicker 4s ease-in-out infinite',
        'badge-ping': 'badge-ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'type-cursor': 'type-cursor 1s step-end infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 232, 216, 0.2)' },
          '50%': { boxShadow: '0 0 15px rgba(0, 232, 216, 0.4), 0 0 30px rgba(0, 232, 216, 0.1)' },
        },
        'scanline': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(20px)' },
        },
        'jack-in': {
          '0%': { opacity: '1', transform: 'scale(1)', filter: 'brightness(1)' },
          '30%': { opacity: '1', transform: 'scale(1.05)', filter: 'brightness(2)' },
          '50%': { opacity: '0.8', transform: 'scale(0.95)', filter: 'brightness(3) hue-rotate(180deg)' },
          '70%': { opacity: '1', transform: 'scale(1)', filter: 'brightness(1.5)' },
          '100%': { opacity: '1', transform: 'scale(1)', filter: 'brightness(1)' },
        },
        'data-stream': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 40px' },
        },
        'neon-flicker': {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.8' },
          '94%': { opacity: '1' },
          '96%': { opacity: '0.9' },
          '97%': { opacity: '1' },
        },
        'badge-ping': {
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'type-cursor': {
          '0%, 100%': { borderColor: '#00e8d8' },
          '50%': { borderColor: 'transparent' },
        },
      },
      // レスポンシブ: 折りたたみスマホ対応ブレイクポイント
      screens: {
        'xs': '360px',
        'fold': '600px',
      },
    },
  },
  plugins: [],
};
