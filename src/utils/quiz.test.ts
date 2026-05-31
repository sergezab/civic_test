import { describe, expect, it } from 'vitest'
import { shuffle, sample, buildChoices } from './quiz'
import type { Question } from '../data/questions'

const mockQuestion: Question = {
  id: 1,
  category: 'Test',
  question: 'What is the supreme law of the land?',
  type: 'choice',
  senior: false,
  acceptableAnswers: ['the Constitution'],
  correct: 'the Constitution',
  distractors: ['the Declaration of Independence', 'the Bill of Rights', 'the Articles of Confederation'],
}

describe('shuffle', () => {
  it('returns same length array', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr)).toHaveLength(arr.length)
  })

  it('contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr).sort()).toEqual([...arr].sort())
  })

  it('does not mutate the input array', () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    shuffle(arr)
    expect(arr).toEqual(copy)
  })
})

describe('sample', () => {
  it('returns n items from array', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i)
    expect(sample(arr, 10)).toHaveLength(10)
  })

  it('all sampled items are from the original array', () => {
    const arr = [10, 20, 30, 40, 50]
    const result = sample(arr, 3)
    result.forEach((item) => expect(arr).toContain(item))
  })

  it('returns full array if n >= length', () => {
    const arr = [1, 2, 3]
    expect(sample(arr, 10)).toHaveLength(3)
  })
})

describe('buildChoices', () => {
  it('returns 4 choices for a choice question', () => {
    const choices = buildChoices(mockQuestion)
    expect(choices).toHaveLength(4)
  })

  it('exactly one choice is correct', () => {
    const choices = buildChoices(mockQuestion)
    const correct = choices.filter((c) => c.correct)
    expect(correct).toHaveLength(1)
    expect(correct[0]?.text).toBe('the Constitution')
  })

  it('returns empty array for spoken questions', () => {
    const spoken: Question = {
      id: 2,
      category: 'Test',
      question: 'Who is one of your state senators now?',
      type: 'spoken',
      senior: false,
      acceptableAnswers: ['Answers will vary.'],
    }
    expect(buildChoices(spoken)).toHaveLength(0)
  })
})
