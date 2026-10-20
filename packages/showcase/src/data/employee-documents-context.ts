// The token the employee route provides its documents under, and the documents section injects them
// by (#496). A module of its own: both import it, and the list's module stays the route's alone.
import { context } from '@pdxui/core';
import type { EmployeeDocuments } from './employee-documents';

export const EmployeeDocumentsContext = context<EmployeeDocuments>('employee-documents');
