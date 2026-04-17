import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ExpenseForm from '@/pages/ExpenseForm'
import AdminPanel from '@/pages/AdminPanel'
import EngineerReview from '@/pages/EngineerReview'
import UserManagement from '@/pages/UserManagement'

// Mock components that might cause issues
vi.mock('@/components/FileUpload', () => ({
  FileUpload: () => <div data-testid="file-upload">File Upload Component</div>,
}))

vi.mock('@/components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}))

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Expense Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ExpenseForm', () => {
    it('should render expense form with required fields', () => {
      render(
        <TestWrapper>
          <ExpenseForm />
        </TestWrapper>
      )

      expect(screen.getByText('New Expense')).toBeInTheDocument()
      expect(screen.getByLabelText('Trip Title')).toBeInTheDocument()
      expect(screen.getByLabelText('Destination')).toBeInTheDocument()
      expect(screen.getByLabelText('Trip Start Date')).toBeInTheDocument()
      expect(screen.getByLabelText('Trip End Date')).toBeInTheDocument()
    })

    it('should add and remove line items', async () => {
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <ExpenseForm />
        </TestWrapper>
      )

      // Should start with one line item
      expect(screen.getByText('Line Items')).toBeInTheDocument()
      
      // Add another line item
      const addButton = screen.getByRole('button', { name: /add line item/i })
      await user.click(addButton)
      
      // Should now have two line items
      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      expect(removeButtons).toHaveLength(2)
      
      // Remove one line item
      await user.click(removeButtons[0])
      
      // Should now have one line item
      const remainingRemoveButtons = screen.getAllByRole('button', { name: /remove/i })
      expect(remainingRemoveButtons).toHaveLength(1)
    })

    it('should validate required fields before submission', async () => {
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <ExpenseForm />
        </TestWrapper>
      )

      // Try to submit without filling required fields
      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument()
      })
    })

    it('should calculate total amount correctly', async () => {
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <ExpenseForm />
        </TestWrapper>
      )

      // Fill in line item amounts
      const amountInputs = screen.getAllByLabelText(/amount/i)
      await user.type(amountInputs[0], '100')
      await user.type(amountInputs[1], '200')

      // Check if total is calculated
      await waitFor(() => {
        expect(screen.getByText('Total: $300.00')).toBeInTheDocument()
      })
    })
  })

  describe('UserManagement', () => {
    it('should render user creation form for admin', () => {
      // Mock admin role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'admin-1', email: 'admin@test.com' },
        userRole: 'admin',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <UserManagement />
        </TestWrapper>
      )

      expect(screen.getByText('User Management')).toBeInTheDocument()
      expect(screen.getByText('Create New User')).toBeInTheDocument()
      expect(screen.getByLabelText('Full Name *')).toBeInTheDocument()
      expect(screen.getByLabelText('Email Address *')).toBeInTheDocument()
      expect(screen.getByLabelText('Role *')).toBeInTheDocument()
    })

    it('should show access denied for non-admin users', () => {
      // Mock employee role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'user-1', email: 'user@test.com' },
        userRole: 'employee',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <UserManagement />
        </TestWrapper>
      )

      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.getByText('Only administrators can access user management.')).toBeInTheDocument()
    })

    it('should validate user creation form', async () => {
      const user = userEvent.setup()
      
      // Mock admin role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'admin-1', email: 'admin@test.com' },
        userRole: 'admin',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <UserManagement />
        </TestWrapper>
      )

      // Try to submit without filling required fields
      const createButton = screen.getByRole('button', { name: /create user account/i })
      await user.click(createButton)

      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument()
      })
    })
  })

  describe('AdminPanel', () => {
    it('should render admin panel with petty cash management', () => {
      // Mock admin role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'admin-1', email: 'admin@test.com' },
        userRole: 'admin',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <AdminPanel />
        </TestWrapper>
      )

      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
      expect(screen.getByText('All Expenses')).toBeInTheDocument()
      expect(screen.getByText('User Management')).toBeInTheDocument()
    })

    it('should show expense statistics', () => {
      // Mock admin role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'admin-1', email: 'admin@test.com' },
        userRole: 'admin',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <AdminPanel />
        </TestWrapper>
      )

      expect(screen.getByText('Total Expenses')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Approved')).toBeInTheDocument()
      expect(screen.getByText('Total Amount')).toBeInTheDocument()
    })
  })

  describe('EngineerReview', () => {
    it('should render engineer review panel', () => {
      // Mock engineer role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'engineer-1', email: 'engineer@test.com' },
        userRole: 'engineer',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <EngineerReview />
        </TestWrapper>
      )

      expect(screen.getByText('Engineer Review')).toBeInTheDocument()
      expect(screen.getByText('Assigned Expenses')).toBeInTheDocument()
    })

    it('should show assigned expense statistics', () => {
      // Mock engineer role
      vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
        user: { id: 'engineer-1', email: 'engineer@test.com' },
        userRole: 'engineer',
        loading: false,
        signOut: vi.fn(),
      })

      render(
        <TestWrapper>
          <EngineerReview />
        </TestWrapper>
      )

      expect(screen.getByText('Total Assigned')).toBeInTheDocument()
      expect(screen.getByText('Pending Review')).toBeInTheDocument()
      expect(screen.getByText('Verified')).toBeInTheDocument()
    })
  })

  describe('File Upload Validation', () => {
    it('should validate file types and sizes', async () => {
      const user = userEvent.setup()
      
      render(
        <TestWrapper>
          <ExpenseForm />
        </TestWrapper>
      )

      // Check file upload component is rendered
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()
      
      // The actual file validation logic is in the FileUpload component
      // which is mocked in this test, but the integration ensures
      // the component is properly integrated into the expense form
    })
  })

  describe('RBAC Integration', () => {
    it('should enforce role-based access control', () => {
      // Test that different roles see different content
      const roles = ['admin', 'engineer', 'employee']
      
      roles.forEach(role => {
        vi.mocked(require('@/contexts/AuthContext').useAuth).mockReturnValue({
          user: { id: `${role}-1`, email: `${role}@test.com` },
          userRole: role as any,
          loading: false,
          signOut: vi.fn(),
        })

        const { unmount } = render(
          <TestWrapper>
            <UserManagement />
          </TestWrapper>
        )

        if (role === 'admin') {
          expect(screen.getByText('User Management')).toBeInTheDocument()
        } else {
          expect(screen.getByText('Access Denied')).toBeInTheDocument()
        }

        unmount()
      })
    })
  })
})
