import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExpenseService, CreateExpenseData, UpdateExpenseData } from '@/services/ExpenseService'
import { supabase } from '@/integrations/supabase/client'

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })),
  },
}))

describe('ExpenseService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createExpense', () => {
    it('should create expense with line items and calculate total', async () => {
      const mockExpense = {
        id: 'expense-1',
        user_id: 'user-1',
        title: 'Test Trip',
        destination: 'New York',
        trip_start: '2024-01-01',
        trip_end: '2024-01-03',
        purpose: 'Business meeting',
        total_amount: 500.00,
        status: 'draft',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const mockLineItems = [
        {
          id: 'item-1',
          expense_id: 'expense-1',
          date: '2024-01-01',
          category: 'travel',
          amount: 300.00,
          description: 'Flight ticket',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'item-2',
          expense_id: 'expense-1',
          date: '2024-01-02',
          category: 'lodging',
          amount: 200.00,
          description: 'Hotel stay',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]

      // Mock the Supabase calls
      const mockFrom = vi.mocked(supabase.from)
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()

      mockFrom.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      } as any)

      // Mock expense creation
      mockInsert.mockResolvedValueOnce({
        data: mockExpense,
        error: null,
      })

      // Mock line items creation
      mockInsert.mockResolvedValueOnce({
        data: mockLineItems,
        error: null,
      })

      // Mock audit log
      mockInsert.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      mockSingle.mockResolvedValue({
        data: mockExpense,
        error: null,
      })

      const expenseData: CreateExpenseData = {
        title: 'Test Trip',
        destination: 'New York',
        trip_start: '2024-01-01',
        trip_end: '2024-01-03',
        purpose: 'Business meeting',
        line_items: [
          {
            date: '2024-01-01',
            category: 'travel',
            amount: 300.00,
            description: 'Flight ticket',
          },
          {
            date: '2024-01-02',
            category: 'lodging',
            amount: 200.00,
            description: 'Hotel stay',
          },
        ],
      }

      const result = await ExpenseService.createExpense('user-1', expenseData)

      expect(result).toEqual({
        ...mockExpense,
        expense_line_items: mockLineItems,
      })

      // Verify total amount calculation
      expect(mockExpense.total_amount).toBe(500.00)
    })

    it('should throw error if no line items provided', async () => {
      const expenseData: CreateExpenseData = {
        title: 'Test Trip',
        destination: 'New York',
        trip_start: '2024-01-01',
        trip_end: '2024-01-03',
        line_items: [],
      }

      await expect(ExpenseService.createExpense('user-1', expenseData))
        .rejects.toThrow('At least one line item is required')
    })

    it('should throw error if line item amount is zero or negative', async () => {
      const expenseData: CreateExpenseData = {
        title: 'Test Trip',
        destination: 'New York',
        trip_start: '2024-01-01',
        trip_end: '2024-01-03',
        line_items: [
          {
            date: '2024-01-01',
            category: 'travel',
            amount: 0,
            description: 'Free flight',
          },
        ],
      }

      await expect(ExpenseService.createExpense('user-1', expenseData))
        .rejects.toThrow('All line item amounts must be greater than 0')
    })
  })

  describe('submitExpense', () => {
    it('should submit expense and change status', async () => {
      const mockExpense = {
        id: 'expense-1',
        user_id: 'user-1',
        status: 'draft',
        total_amount: 500.00,
      }

      const mockLineItems = [
        {
          id: 'item-1',
          expense_id: 'expense-1',
          amount: 500.00,
        },
      ]

      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()
      const mockUpdate = vi.fn().mockReturnThis()
      const mockInsert = vi.fn().mockReturnThis()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        update: mockUpdate,
        insert: mockInsert,
      } as any)

      // Mock expense fetch
      mockSingle.mockResolvedValueOnce({
        data: mockExpense,
        error: null,
      })

      // Mock line items fetch
      mockSingle.mockResolvedValueOnce({
        data: mockLineItems,
        error: null,
      })

      // Mock status update
      mockSingle.mockResolvedValueOnce({
        data: { ...mockExpense, status: 'submitted' },
        error: null,
      })

      // Mock audit log
      mockInsert.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await ExpenseService.submitExpense('expense-1', 'user-1')

      expect(result.status).toBe('submitted')
    })

    it('should throw error if expense is not in draft status', async () => {
      const mockExpense = {
        id: 'expense-1',
        user_id: 'user-1',
        status: 'submitted',
        total_amount: 500.00,
      }

      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      } as any)

      mockSingle.mockResolvedValue({
        data: mockExpense,
        error: null,
      })

      await expect(ExpenseService.submitExpense('expense-1', 'user-1'))
        .rejects.toThrow('Only draft expenses can be submitted')
    })
  })

  describe('approveExpense', () => {
    it('should approve expense and log action', async () => {
      const mockExpense = {
        id: 'expense-1',
        status: 'verified',
        admin_comment: 'Approved for reimbursement',
      }

      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()
      const mockUpdate = vi.fn().mockReturnThis()
      const mockInsert = vi.fn().mockReturnThis()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        update: mockUpdate,
        insert: mockInsert,
      } as any)

      // Mock role check
      mockSingle.mockResolvedValueOnce({
        data: { role: 'admin' },
        error: null,
      })

      // Mock expense update
      mockSingle.mockResolvedValueOnce({
        data: { ...mockExpense, status: 'approved' },
        error: null,
      })

      // Mock audit log
      mockInsert.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await ExpenseService.approveExpense('expense-1', 'admin-1', 'Approved')

      expect(result.status).toBe('approved')
      expect(result.admin_comment).toBe('Approved for reimbursement')
    })

    it('should throw error if user is not admin', async () => {
      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      } as any)

      // Mock role check - not admin
      mockSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      await expect(ExpenseService.approveExpense('expense-1', 'user-1', 'Approved'))
        .rejects.toThrow('Only administrators can approve expenses')
    })
  })

  describe('rejectExpense', () => {
    it('should reject expense and log action', async () => {
      const mockExpense = {
        id: 'expense-1',
        status: 'rejected',
        admin_comment: 'Missing receipts',
      }

      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()
      const mockUpdate = vi.fn().mockReturnThis()
      const mockInsert = vi.fn().mockReturnThis()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        update: mockUpdate,
        insert: mockInsert,
      } as any)

      // Mock role check
      mockSingle.mockResolvedValueOnce({
        data: { role: 'admin' },
        error: null,
      })

      // Mock expense update
      mockSingle.mockResolvedValueOnce({
        data: mockExpense,
        error: null,
      })

      // Mock audit log
      mockInsert.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await ExpenseService.rejectExpense('expense-1', 'admin-1', 'Missing receipts')

      expect(result.status).toBe('rejected')
      expect(result.admin_comment).toBe('Missing receipts')
    })
  })

  describe('verifyExpense', () => {
    it('should verify expense and log action', async () => {
      const mockExpense = {
        id: 'expense-1',
        assigned_engineer_id: 'engineer-1',
        status: 'verified',
      }

      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()
      const mockUpdate = vi.fn().mockReturnThis()
      const mockInsert = vi.fn().mockReturnThis()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        update: mockUpdate,
        insert: mockInsert,
      } as any)

      // Mock assignment check
      mockSingle.mockResolvedValueOnce({
        data: { assigned_engineer_id: 'engineer-1' },
        error: null,
      })

      // Mock expense update
      mockSingle.mockResolvedValueOnce({
        data: mockExpense,
        error: null,
      })

      // Mock audit log
      mockInsert.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await ExpenseService.verifyExpense('expense-1', 'engineer-1', true, 'Verified')

      expect(result.status).toBe('verified')
    })

    it('should throw error if engineer is not assigned to expense', async () => {
      const mockFrom = vi.mocked(supabase.from)
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn()

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      } as any)

      // Mock assignment check - not assigned
      mockSingle.mockResolvedValue({
        data: { assigned_engineer_id: 'other-engineer' },
        error: null,
      })

      await expect(ExpenseService.verifyExpense('expense-1', 'engineer-1', true, 'Verified'))
        .rejects.toThrow("You don't have permission to review this expense")
    })
  })
})
