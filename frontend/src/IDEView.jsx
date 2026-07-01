/**
 * IDEView.jsx
 * Live Pair-Programming IDE with Monaco Editor + AI code review
 */
import React, { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';

const DEFAULT_CODE = {
  python: `# AI Interview Platform — Live Coding Challenge
# Time: 45:00 remaining

def two_sum(nums, target):
    """
    Find two numbers that add up to target.
    Return their indices.
    """
    # Your solution here
    pass

# Test cases
print(two_sum([2, 7, 11, 15], 9))  # Expected: [0, 1]
print(two_sum([3, 2, 4], 6))       # Expected: [1, 2]
`,
  javascript: `// AI Interview Platform — Live Coding Challenge
// Time: 45:00 remaining

/**
 * Find two numbers that add up to target.
 * @param {number[]} nums
 * @param {number} target
 * @returns {number[]}
 */
function twoSum(nums, target) {
  // Your solution here
}

// Test cases
console.log(twoSum([2, 7, 11, 15], 9));  // [0, 1]
console.log(twoSum([3, 2, 4], 6));       // [1, 2]
`,
};

export default function IDEView({ onSendCode }) {
  const [lang, setLang] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [output, setOutput] = useState('// Output will appear here after running...');
  const [isRunning, setIsRunning] = useState(false);

  const handleLangChange = useCallback((newLang) => {
    setLang(newLang);
    setCode(DEFAULT_CODE[newLang] || '');
  }, []);

  const handleRun = useCallback(() => {
    setIsRunning(true);
    setOutput('⚡ Executing...');
    // Simulate execution (in production, this hits a sandboxed backend endpoint)
    setTimeout(() => {
      setOutput(`✓ Code submitted for AI evaluation at ${new Date().toLocaleTimeString()}\n\nAI Feedback: Your approach looks clean. Can you explain the time complexity of your chosen algorithm? What about edge cases with negative numbers?`);
      setIsRunning(false);
      // Optionally also send the code to the interview AI
      onSendCode?.(code);
    }, 1200);
  }, [code, onSendCode]);

  return (
    <div className="ide-grid">
      <div className="ide-panel">
        <div className="ide-header">
          <div className="ide-tabs">
            <div className={`ide-tab ${lang === 'python' ? 'active' : ''}`} onClick={() => handleLangChange('python')}>
              solution.py
            </div>
            <div className={`ide-tab ${lang === 'javascript' ? 'active' : ''}`} onClick={() => handleLangChange('javascript')}>
              solution.js
            </div>
          </div>
          <div className="ide-controls">
            <button className="ide-btn lang" onClick={() => handleLangChange(lang === 'python' ? 'javascript' : 'python')}>
              {lang === 'python' ? '🐍 Python' : '⚡ JS'}
            </button>
            <button className="ide-btn run" onClick={handleRun} disabled={isRunning}>
              {isRunning ? '⏳ Running...' : '▶ Run & Submit'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Editor
            height="100%"
            language={lang}
            value={code}
            onChange={setCode}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineHeight: 1.7,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'phase',
              cursorSmoothCaretAnimation: true,
              renderLineHighlight: 'all',
              formatOnPaste: true,
              tabSize: 4,
              padding: { top: 16, bottom: 16 },
            }}
          />
        </div>

        <div className="ide-output">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{output}</pre>
        </div>
      </div>

      {/* Right — Question Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
        <div className="metric-card" style={{ flexShrink: 0 }}>
          <div className="metric-label" style={{ marginBottom: '10px' }}>📋 Current Challenge</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px' }}>
            Two Sum
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Given an array of integers <code style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>nums</code> and
            an integer <code style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>target</code>, return
            indices of the two numbers such that they add up to target.
          </div>
          <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-green)' }}>
            Input:  nums = [2,7,11,15], target = 9<br/>
            Output: [0,1]
          </div>
        </div>

        <div className="metric-card" style={{ flexShrink: 0 }}>
          <div className="metric-label" style={{ marginBottom: '8px' }}>⏱ Time Remaining</div>
          <div style={{ fontSize: '2rem', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent-cyan)' }}>
            44:12
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label" style={{ marginBottom: '8px' }}>💡 Constraints</div>
          <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            <li>2 ≤ nums.length ≤ 10⁴</li>
            <li>-10⁹ ≤ nums[i] ≤ 10⁹</li>
            <li>-10⁹ ≤ target ≤ 10⁹</li>
            <li>Only one valid answer exists</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
