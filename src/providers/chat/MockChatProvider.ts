import type { ChatChunk, ChatMessage, ChatProvider, CodeExample } from './ChatProvider'

export const FACTORIAL: CodeExample = {
  title: 'Factorial',
  code: {
    python: `def factorial(n):
    # Base case: stop the recursion
    if n <= 1:
        return 1
    # Recursive case: shrink the problem
    return n * factorial(n - 1)


print(factorial(5))  # 120`,
    cpp: `#include <iostream>

long factorial(int n) {
    // Base case: stop the recursion
    if (n <= 1) return 1;
    // Recursive case: shrink the problem
    return n * factorial(n - 1);
}

int main() {
    std::cout << factorial(5) << "\\n";  // 120
}`,
    java: `public class Main {
    static long factorial(int n) {
        // Base case: stop the recursion
        if (n <= 1) return 1;
        // Recursive case: shrink the problem
        return n * factorial(n - 1);
    }

    public static void main(String[] args) {
        System.out.println(factorial(5)); // 120
    }
}`,
  },
}

export const FIBONACCI: CodeExample = {
  title: 'Fibonacci',
  code: {
    python: `def fib(n):
    if n < 2:          # two base cases: fib(0) and fib(1)
        return n
    return fib(n - 1) + fib(n - 2)


print([fib(i) for i in range(10)])`,
    cpp: `#include <iostream>

int fib(int n) {
    if (n < 2) return n;  // two base cases
    return fib(n - 1) + fib(n - 2);
}

int main() {
    for (int i = 0; i < 10; i++) std::cout << fib(i) << " ";
}`,
    java: `public class Main {
    static int fib(int n) {
        if (n < 2) return n; // two base cases
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) System.out.print(fib(i) + " ");
    }
}`,
  },
}

export const SUM_LIST: CodeExample = {
  title: 'Sum of a list',
  code: {
    python: `def total(items):
    if not items:              # base case: empty list
        return 0
    return items[0] + total(items[1:])


print(total([3, 1, 4, 1, 5]))  # 14`,
    cpp: `#include <iostream>
#include <vector>

int total(const std::vector<int>& v, size_t i = 0) {
    if (i == v.size()) return 0;   // base case
    return v[i] + total(v, i + 1);
}

int main() {
    std::cout << total({3, 1, 4, 1, 5}) << "\\n";  // 14
}`,
    java: `public class Main {
    static int total(int[] items, int i) {
        if (i == items.length) return 0; // base case
        return items[i] + total(items, i + 1);
    }

    public static void main(String[] args) {
        System.out.println(total(new int[]{3, 1, 4, 1, 5}, 0)); // 14
    }
}`,
  },
}

interface CannedAnswer {
  match: RegExp
  chunks: ChatChunk[]
}

const ANSWERS: CannedAnswer[] = [
  {
    match: /didn'?t get|don'?t understand|confus|again|slower|simpler|repeat/i,
    chunks: [
      { sentence: "No problem, let's slow down." },
      { sentence: 'Recursion is just a function that solves a big problem by calling itself on a smaller version of the same problem.' },
      { sentence: 'Every recursive function needs two parts: a base case that stops, and a recursive case that shrinks the problem.' },
      { sentence: 'Look at the highlighted code: the base case is the if statement, and the recursive case is the return line.', code: FACTORIAL },
      { sentence: 'Which of those two parts would you like me to unpack further?' },
    ],
  },
  {
    match: /base case/i,
    chunks: [
      { sentence: 'Great question, the base case is the most important part of any recursive function.' },
      { sentence: 'It is the condition where the function stops calling itself and simply returns a known answer.' },
      { sentence: 'For factorial, the base case is when n is 1 or less, because factorial of 1 is just 1.', code: FACTORIAL },
      { sentence: 'Without a base case the function would call itself forever and eventually crash with a stack overflow.' },
      { sentence: 'Fibonacci is interesting because it needs two base cases, one for 0 and one for 1.', code: FIBONACCI },
    ],
  },
  {
    match: /stack overflow|infinite|crash/i,
    chunks: [
      { sentence: 'A stack overflow happens when recursive calls pile up faster than they can finish.' },
      { sentence: 'Every call reserves a small frame of memory on the call stack, and that stack has a fixed size.' },
      { sentence: 'If your base case is missing or unreachable, the frames never get released and the program crashes.' },
      { sentence: 'The fix is always the same: make sure every recursive call moves closer to the base case.', code: FACTORIAL },
    ],
  },
  {
    match: /loop|iterat|difference|versus|vs\b/i,
    chunks: [
      { sentence: 'Recursion and loops can solve the same problems, they just express repetition differently.' },
      { sentence: 'A loop repeats by updating variables in place, while recursion repeats by making a new function call with smaller input.' },
      { sentence: 'Recursion shines when the problem is naturally nested, like trees or divide and conquer algorithms.' },
      { sentence: 'Here is a list sum written recursively so you can compare it to the for loop version in your head.', code: SUM_LIST },
    ],
  },
  {
    match: /fib/i,
    chunks: [
      { sentence: 'Fibonacci is the classic second example of recursion.' },
      { sentence: 'Each number is the sum of the two before it, so fib of n calls fib of n minus 1 and fib of n minus 2.', code: FIBONACCI },
      { sentence: 'Notice it has two base cases, since we need starting values for both 0 and 1.' },
      { sentence: 'This naive version is slow for large n, and we will fix that later with memoization.' },
    ],
  },
  {
    match: /code|example|show|factorial/i,
    chunks: [
      { sentence: "Sure, let's look at factorial, the classic first recursive function." },
      { sentence: 'Factorial of n multiplies n by the factorial of n minus 1, all the way down to 1.', code: FACTORIAL },
      { sentence: 'Trace it with n equals 3: we get 3 times factorial of 2, which is 3 times 2 times factorial of 1.' },
      { sentence: 'Factorial of 1 hits the base case and returns 1, so the whole thing unwinds to 6.' },
      { sentence: 'Try switching the language tab to see the same idea in C++ and Java.' },
    ],
  },
]

const DEFAULT_ANSWER: ChatChunk[] = [
  { sentence: 'Recursion is when a function solves a problem by calling itself on a smaller piece of that problem.' },
  { sentence: 'Think of it like Russian nesting dolls: you open one, and inside is a smaller version of the same doll.' },
  { sentence: 'The smallest doll that does not open is the base case, and that is what stops the recursion.' },
  { sentence: 'The classic example is factorial, which I have put in the code panel below.', code: FACTORIAL },
  { sentence: 'Would you like me to walk through how the calls unwind step by step?' },
]

export const GREETING: ChatChunk[] = [
  { sentence: "Hi, I'm your tutor for today's lesson on recursion." },
  { sentence: 'Ask me anything with your mic or the text box, and interrupt me whenever something is unclear.' },
  { sentence: "Let's start with a simple question: what do you think recursion means?" },
]

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

const jitter = (base: number) => base + Math.random() * base * 0.6

export class MockChatProvider implements ChatProvider {
  async *stream(history: ChatMessage[], signal?: AbortSignal): AsyncIterable<ChatChunk> {
    const last = [...history].reverse().find((m) => m.role === 'student')?.content ?? ''
    const chunks = last === '' ? GREETING : (ANSWERS.find((a) => a.match.test(last))?.chunks ?? DEFAULT_ANSWER)

    // "thinking" latency before the first token
    await sleep(jitter(900), signal)
    for (const chunk of chunks) {
      if (signal?.aborted) return
      yield chunk
      // inter-sentence generation latency
      await sleep(jitter(350), signal)
    }
  }
}
