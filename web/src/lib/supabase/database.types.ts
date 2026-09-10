export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          bb_item_id: string | null
          body: string | null
          captured_at: string
          course_id: string
          fts: unknown
          id: number
          is_read: boolean | null
          posted_at: string | null
          title: string | null
        }
        Insert: {
          bb_item_id?: string | null
          body?: string | null
          captured_at?: string
          course_id: string
          fts?: unknown
          id?: never
          is_read?: boolean | null
          posted_at?: string | null
          title?: string | null
        }
        Update: {
          bb_item_id?: string | null
          body?: string | null
          captured_at?: string
          course_id?: string
          fts?: unknown
          id?: never
          is_read?: boolean | null
          posted_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      assignment_progress: {
        Row: {
          assignment_id: string
          effort_override: number | null
          est_minutes: number | null
          feedback: string | null
          graded_at: string | null
          letter: string | null
          notes: string | null
          planned_finish: string | null
          planned_start: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          score: number | null
          score_max: number | null
          status: Database["public"]["Enums"]["progress_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          effort_override?: number | null
          est_minutes?: number | null
          feedback?: string | null
          graded_at?: string | null
          letter?: string | null
          notes?: string | null
          planned_finish?: string | null
          planned_start?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          score?: number | null
          score_max?: number | null
          status?: Database["public"]["Enums"]["progress_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          effort_override?: number | null
          est_minutes?: number | null
          feedback?: string | null
          graded_at?: string | null
          letter?: string | null
          notes?: string | null
          planned_finish?: string | null
          planned_start?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          score?: number | null
          score_max?: number | null
          status?: Database["public"]["Enums"]["progress_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "v_assignment_effort"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "v_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "v_upcoming"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          available_from: string | null
          bb_column_id: string | null
          bb_item_id: string | null
          bb_last_seen: string | null
          bb_submission_status: string | null
          bb_url: string | null
          component_id: number | null
          confidence: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          created_at: string
          description: string | null
          due_at: string | null
          due_date: string | null
          due_rule: string | null
          event_end: string | null
          event_start: string | null
          group_key: string | null
          id: string
          is_extra_credit: boolean
          is_group: boolean
          points_possible: number | null
          recurrence: Database["public"]["Enums"]["recurrence_kind"]
          sequence_no: number | null
          series_key: string | null
          source: Database["public"]["Enums"]["data_source"]
          source_ref: string | null
          submission: Database["public"]["Enums"]["submission_channel"]
          submission_format: string | null
          title: string
          type: Database["public"]["Enums"]["assignment_type"]
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          bb_column_id?: string | null
          bb_item_id?: string | null
          bb_last_seen?: string | null
          bb_submission_status?: string | null
          bb_url?: string | null
          component_id?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          due_rule?: string | null
          event_end?: string | null
          event_start?: string | null
          group_key?: string | null
          id: string
          is_extra_credit?: boolean
          is_group?: boolean
          points_possible?: number | null
          recurrence?: Database["public"]["Enums"]["recurrence_kind"]
          sequence_no?: number | null
          series_key?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          source_ref?: string | null
          submission?: Database["public"]["Enums"]["submission_channel"]
          submission_format?: string | null
          title: string
          type: Database["public"]["Enums"]["assignment_type"]
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          bb_column_id?: string | null
          bb_item_id?: string | null
          bb_last_seen?: string | null
          bb_submission_status?: string | null
          bb_url?: string | null
          component_id?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          due_rule?: string | null
          event_end?: string | null
          event_start?: string | null
          group_key?: string | null
          id?: string
          is_extra_credit?: boolean
          is_group?: boolean
          points_possible?: number | null
          recurrence?: Database["public"]["Enums"]["recurrence_kind"]
          sequence_no?: number | null
          series_key?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          source_ref?: string | null
          submission?: Database["public"]["Enums"]["submission_channel"]
          submission_format?: string | null
          title?: string
          type?: Database["public"]["Enums"]["assignment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "grade_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      bb_content: {
        Row: {
          assignment_id: string | null
          bb_item_id: string | null
          bb_type: string | null
          body: string | null
          captured_at: string
          course_id: string
          detail: Json | null
          fts: unknown
          id: number
          item_kind: string | null
          modified_at: string | null
          parent_id: number | null
          path: string | null
          run_id: string | null
          state: string | null
          title: string
          url: string | null
        }
        Insert: {
          assignment_id?: string | null
          bb_item_id?: string | null
          bb_type?: string | null
          body?: string | null
          captured_at?: string
          course_id: string
          detail?: Json | null
          fts?: unknown
          id?: never
          item_kind?: string | null
          modified_at?: string | null
          parent_id?: number | null
          path?: string | null
          run_id?: string | null
          state?: string | null
          title: string
          url?: string | null
        }
        Update: {
          assignment_id?: string | null
          bb_item_id?: string | null
          bb_type?: string | null
          body?: string | null
          captured_at?: string
          course_id?: string
          detail?: Json | null
          fts?: unknown
          id?: never
          item_kind?: string | null
          modified_at?: string | null
          parent_id?: number | null
          path?: string | null
          run_id?: string | null
          state?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bb_content_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_content_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_effort"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_content_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_content_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_upcoming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_content_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_content_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_content_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_content_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "bb_content"
            referencedColumns: ["id"]
          },
        ]
      }
      bb_file_text: {
        Row: {
          char_count: number | null
          extracted_at: string
          file_id: number
          fts: unknown
          id: number
          text: string
          unit_kind: string
          unit_no: number
        }
        Insert: {
          char_count?: number | null
          extracted_at?: string
          file_id: number
          fts?: unknown
          id?: never
          text: string
          unit_kind: string
          unit_no?: number
        }
        Update: {
          char_count?: number | null
          extracted_at?: string
          file_id?: number
          fts?: unknown
          id?: never
          text?: string
          unit_kind?: string
          unit_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "bb_file_text_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "bb_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_file_text_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "v_bb_files_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_file_text_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "v_file_layout"
            referencedColumns: ["id"]
          },
        ]
      }
      bb_files: {
        Row: {
          assignment_id: string | null
          bb_course_id: string
          bb_modified_at: string | null
          bucket: Database["public"]["Enums"]["file_bucket"]
          bytes: number | null
          captured_at: string
          classification_confidence: number | null
          classified_by: Database["public"]["Enums"]["classifier"] | null
          content_id: string | null
          course_id: string | null
          downloaded_at: string | null
          file_name: string
          id: number
          link_confidence: number | null
          local_path: string | null
          mime_type: string | null
          notes: string | null
          path: string | null
          reading_id: number | null
          run_id: string | null
          session_id: number | null
          sha256: string | null
          source_url: string
          storage_path: string | null
          superseded_by: number | null
          text_status: Database["public"]["Enums"]["text_status"]
          week_no: number | null
        }
        Insert: {
          assignment_id?: string | null
          bb_course_id: string
          bb_modified_at?: string | null
          bucket?: Database["public"]["Enums"]["file_bucket"]
          bytes?: number | null
          captured_at?: string
          classification_confidence?: number | null
          classified_by?: Database["public"]["Enums"]["classifier"] | null
          content_id?: string | null
          course_id?: string | null
          downloaded_at?: string | null
          file_name: string
          id?: never
          link_confidence?: number | null
          local_path?: string | null
          mime_type?: string | null
          notes?: string | null
          path?: string | null
          reading_id?: number | null
          run_id?: string | null
          session_id?: number | null
          sha256?: string | null
          source_url: string
          storage_path?: string | null
          superseded_by?: number | null
          text_status?: Database["public"]["Enums"]["text_status"]
          week_no?: number | null
        }
        Update: {
          assignment_id?: string | null
          bb_course_id?: string
          bb_modified_at?: string | null
          bucket?: Database["public"]["Enums"]["file_bucket"]
          bytes?: number | null
          captured_at?: string
          classification_confidence?: number | null
          classified_by?: Database["public"]["Enums"]["classifier"] | null
          content_id?: string | null
          course_id?: string | null
          downloaded_at?: string | null
          file_name?: string
          id?: never
          link_confidence?: number | null
          local_path?: string | null
          mime_type?: string | null
          notes?: string | null
          path?: string | null
          reading_id?: number | null
          run_id?: string | null
          session_id?: number | null
          sha256?: string | null
          source_url?: string
          storage_path?: string | null
          superseded_by?: number | null
          text_status?: Database["public"]["Enums"]["text_status"]
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_effort"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_upcoming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_files_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "bb_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "v_bb_files_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "v_file_layout"
            referencedColumns: ["id"]
          },
        ]
      }
      bb_raw: {
        Row: {
          bb_course_id: string | null
          bytes: number | null
          captured_at: string
          id: number
          kind: string
          payload: Json
          run_id: string
        }
        Insert: {
          bb_course_id?: string | null
          bytes?: number | null
          captured_at?: string
          id?: never
          kind: string
          payload: Json
          run_id: string
        }
        Update: {
          bb_course_id?: string | null
          bytes?: number | null
          captured_at?: string
          id?: never
          kind?: string
          payload?: Json
          run_id?: string
        }
        Relationships: []
      }
      bb_text_embeddings: {
        Row: {
          embedded_at: string
          embedding: string
          id: number
          model: string
          part_no: number
          part_range: unknown
          text_id: number
        }
        Insert: {
          embedded_at?: string
          embedding: string
          id?: never
          model: string
          part_no?: number
          part_range?: unknown
          text_id: number
        }
        Update: {
          embedded_at?: string
          embedding?: string
          id?: never
          model?: string
          part_no?: number
          part_range?: unknown
          text_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bb_text_embeddings_text_id_fkey"
            columns: ["text_id"]
            isOneToOne: false
            referencedRelation: "bb_file_text"
            referencedColumns: ["id"]
          },
        ]
      }
      course_maps: {
        Row: {
          course_id: string
          id: number
          map: Json
          mapped_at: string
          notes: string | null
          version: number
        }
        Insert: {
          course_id: string
          id?: never
          map: Json
          mapped_at?: string
          notes?: string | null
          version: number
        }
        Update: {
          course_id?: string
          id?: never
          map?: Json
          mapped_at?: string
          notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_maps_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_maps_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_maps_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      course_staff: {
        Row: {
          bb_user_id: string | null
          course_id: string
          email: string | null
          id: number
          name: string
          notes: string | null
          office: string | null
          office_hours: string | null
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          source: Database["public"]["Enums"]["data_source"]
        }
        Insert: {
          bb_user_id?: string | null
          course_id: string
          email?: string | null
          id?: never
          name: string
          notes?: string | null
          office?: string | null
          office_hours?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          source?: Database["public"]["Enums"]["data_source"]
        }
        Update: {
          bb_user_id?: string | null
          course_id?: string
          email?: string | null
          id?: never
          name?: string
          notes?: string | null
          office?: string | null
          office_hours?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          source?: Database["public"]["Enums"]["data_source"]
        }
        Relationships: [
          {
            foreignKeyName: "course_staff_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_staff_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_staff_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      courses: {
        Row: {
          bb_batch_uid: string | null
          bb_course_id: string
          bb_group_id: string | null
          bb_group_set_id: string | null
          bb_id: string | null
          bb_membership_id: string | null
          bb_url: string | null
          created_at: string
          credits: number | null
          group_notes: string | null
          id: string
          kind: Database["public"]["Enums"]["course_kind"]
          location: string | null
          notes: string | null
          number: string
          parent_course_id: string | null
          section: string
          source: Database["public"]["Enums"]["data_source"]
          subject: string
          syllabus_path: string | null
          syllabus_status: Database["public"]["Enums"]["syllabus_status"]
          term_id: string
          title_bb: string
          title_short: string
          updated_at: string
        }
        Insert: {
          bb_batch_uid?: string | null
          bb_course_id: string
          bb_group_id?: string | null
          bb_group_set_id?: string | null
          bb_id?: string | null
          bb_membership_id?: string | null
          bb_url?: string | null
          created_at?: string
          credits?: number | null
          group_notes?: string | null
          id: string
          kind?: Database["public"]["Enums"]["course_kind"]
          location?: string | null
          notes?: string | null
          number: string
          parent_course_id?: string | null
          section: string
          source?: Database["public"]["Enums"]["data_source"]
          subject: string
          syllabus_path?: string | null
          syllabus_status?: Database["public"]["Enums"]["syllabus_status"]
          term_id: string
          title_bb: string
          title_short: string
          updated_at?: string
        }
        Update: {
          bb_batch_uid?: string | null
          bb_course_id?: string
          bb_group_id?: string | null
          bb_group_set_id?: string | null
          bb_id?: string | null
          bb_membership_id?: string | null
          bb_url?: string | null
          created_at?: string
          credits?: number | null
          group_notes?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["course_kind"]
          location?: string | null
          notes?: string | null
          number?: string
          parent_course_id?: string | null
          section?: string
          source?: Database["public"]["Enums"]["data_source"]
          subject?: string
          syllabus_path?: string | null
          syllabus_status?: Database["public"]["Enums"]["syllabus_status"]
          term_id?: string
          title_bb?: string
          title_short?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_parent_course_id_fkey"
            columns: ["parent_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_parent_course_id_fkey"
            columns: ["parent_course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "courses_parent_course_id_fkey"
            columns: ["parent_course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "courses_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      effort_base: {
        Row: {
          base: number
          category: string
          glyph: string
          in_workload: boolean
          type: Database["public"]["Enums"]["assignment_type"]
        }
        Insert: {
          base: number
          category: string
          glyph: string
          in_workload?: boolean
          type: Database["public"]["Enums"]["assignment_type"]
        }
        Update: {
          base?: number
          category?: string
          glyph?: string
          in_workload?: boolean
          type?: Database["public"]["Enums"]["assignment_type"]
        }
        Relationships: []
      }
      grade_components: {
        Row: {
          aggregation: Database["public"]["Enums"]["aggregation_rule"]
          code: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          count_expected: number | null
          course_id: string
          drop_lowest: number
          id: number
          is_extra_credit: boolean
          name: string
          normalize_to: number | null
          notes: string | null
          parent_id: number | null
          points: number | null
          rank_weights: Json | null
          source: Database["public"]["Enums"]["data_source"]
          weight_pct: number | null
        }
        Insert: {
          aggregation?: Database["public"]["Enums"]["aggregation_rule"]
          code: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          count_expected?: number | null
          course_id: string
          drop_lowest?: number
          id?: never
          is_extra_credit?: boolean
          name: string
          normalize_to?: number | null
          notes?: string | null
          parent_id?: number | null
          points?: number | null
          rank_weights?: Json | null
          source?: Database["public"]["Enums"]["data_source"]
          weight_pct?: number | null
        }
        Update: {
          aggregation?: Database["public"]["Enums"]["aggregation_rule"]
          code?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          count_expected?: number | null
          course_id?: string
          drop_lowest?: number
          id?: never
          is_extra_credit?: boolean
          name?: string
          normalize_to?: number | null
          notes?: string | null
          parent_id?: number | null
          points?: number | null
          rank_weights?: Json | null
          source?: Database["public"]["Enums"]["data_source"]
          weight_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grade_components_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_components_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "grade_components_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "grade_components_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "grade_components"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_schemes: {
        Row: {
          ai_policy: string | null
          confidence: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          graded_out_of: number | null
          late_policy: string | null
          letter_scale: Json | null
          method: Database["public"]["Enums"]["grading_method"]
          notes: string | null
          source: Database["public"]["Enums"]["data_source"]
          total_points: number | null
        }
        Insert: {
          ai_policy?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          graded_out_of?: number | null
          late_policy?: string | null
          letter_scale?: Json | null
          method?: Database["public"]["Enums"]["grading_method"]
          notes?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          total_points?: number | null
        }
        Update: {
          ai_policy?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id?: string
          graded_out_of?: number | null
          late_policy?: string | null
          letter_scale?: Json | null
          method?: Database["public"]["Enums"]["grading_method"]
          notes?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          total_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grading_schemes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_schemes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "grading_schemes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      meetings: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          day_of_week: number
          end_time: string | null
          ends_on: string | null
          id: number
          location: string | null
          source: Database["public"]["Enums"]["data_source"]
          start_time: string | null
          starts_on: string | null
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          day_of_week: number
          end_time?: string | null
          ends_on?: string | null
          id?: never
          location?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          start_time?: string | null
          starts_on?: string | null
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id?: string
          day_of_week?: number
          end_time?: string | null
          ends_on?: string | null
          id?: never
          location?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          start_time?: string | null
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "meetings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      reading_progress: {
        Row: {
          notes: string | null
          reading_id: number
          status: Database["public"]["Enums"]["progress_status"]
          updated_at: string
        }
        Insert: {
          notes?: string | null
          reading_id: number
          status?: Database["public"]["Enums"]["progress_status"]
          updated_at?: string
        }
        Update: {
          notes?: string | null
          reading_id?: number
          status?: Database["public"]["Enums"]["progress_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: true
            referencedRelation: "readings"
            referencedColumns: ["id"]
          },
        ]
      }
      readings: {
        Row: {
          citation: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          for_date: string | null
          id: number
          notes: string | null
          on_blackboard: boolean
          required: boolean
          source: Database["public"]["Enums"]["data_source"]
          topic: string | null
          url: string | null
          week_no: number | null
        }
        Insert: {
          citation: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id: string
          for_date?: string | null
          id?: never
          notes?: string | null
          on_blackboard?: boolean
          required?: boolean
          source?: Database["public"]["Enums"]["data_source"]
          topic?: string | null
          url?: string | null
          week_no?: number | null
        }
        Update: {
          citation?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id?: string
          for_date?: string | null
          id?: never
          notes?: string | null
          on_blackboard?: boolean
          required?: boolean
          source?: Database["public"]["Enums"]["data_source"]
          topic?: string | null
          url?: string | null
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "readings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "readings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      sessions: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          counts_attendance: boolean | null
          course_id: string
          id: number
          kind: Database["public"]["Enums"]["session_kind"]
          notes: string | null
          session_date: string
          source: Database["public"]["Enums"]["data_source"]
          topic: string | null
          week_no: number | null
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          counts_attendance?: boolean | null
          course_id: string
          id?: never
          kind?: Database["public"]["Enums"]["session_kind"]
          notes?: string | null
          session_date: string
          source?: Database["public"]["Enums"]["data_source"]
          topic?: string | null
          week_no?: number | null
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          counts_attendance?: boolean | null
          course_id?: string
          id?: never
          kind?: Database["public"]["Enums"]["session_kind"]
          notes?: string | null
          session_date?: string
          source?: Database["public"]["Enums"]["data_source"]
          topic?: string | null
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          finished_at: string | null
          id: number
          notes: string | null
          ran_at: string
          run_id: string | null
          scope: string | null
          source: Database["public"]["Enums"]["data_source"]
          started_at: string | null
          status: string
          summary: Json | null
          trigger: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: never
          notes?: string | null
          ran_at?: string
          run_id?: string | null
          scope?: string | null
          source: Database["public"]["Enums"]["data_source"]
          started_at?: string | null
          status?: string
          summary?: Json | null
          trigger?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: never
          notes?: string | null
          ran_at?: string
          run_id?: string | null
          scope?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          started_at?: string | null
          status?: string
          summary?: Json | null
          trigger?: string | null
        }
        Relationships: []
      }
      sync_stage_runs: {
        Row: {
          counts: Json
          course_id: string | null
          error: string | null
          finished_at: string | null
          id: number
          stage: string
          started_at: string
          status: string
          sync_run_id: number
        }
        Insert: {
          counts?: Json
          course_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: never
          stage: string
          started_at?: string
          status: string
          sync_run_id: number
        }
        Update: {
          counts?: Json
          course_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: never
          stage?: string
          started_at?: string
          status?: string
          sync_run_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_stage_runs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_stage_runs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "sync_stage_runs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "sync_stage_runs_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          end_date: string
          id: string
          name: string
          notes: string | null
          start_date: string
        }
        Insert: {
          end_date: string
          id: string
          name: string
          notes?: string | null
          start_date: string
        }
        Update: {
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_assignment_effort: {
        Row: {
          category: string | null
          course_id: string | null
          course_qualifies: boolean | null
          effort: number | null
          effort_source: string | null
          glyph: string | null
          id: string | null
          in_workload: boolean | null
          is_override: boolean | null
          med: number | null
          multiplier_applied: boolean | null
          points_n: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      v_bb_files_current: {
        Row: {
          assignment_id: string | null
          bb_course_id: string | null
          bb_modified_at: string | null
          bucket: Database["public"]["Enums"]["file_bucket"] | null
          bytes: number | null
          captured_at: string | null
          classification_confidence: number | null
          classified_by: Database["public"]["Enums"]["classifier"] | null
          content_id: string | null
          course_id: string | null
          downloaded_at: string | null
          file_name: string | null
          id: number | null
          link_confidence: number | null
          local_path: string | null
          mime_type: string | null
          notes: string | null
          path: string | null
          reading_id: number | null
          run_id: string | null
          session_id: number | null
          sha256: string | null
          source_url: string | null
          storage_path: string | null
          superseded_by: number | null
          text_status: Database["public"]["Enums"]["text_status"] | null
          week_no: number | null
        }
        Insert: {
          assignment_id?: string | null
          bb_course_id?: string | null
          bb_modified_at?: string | null
          bucket?: Database["public"]["Enums"]["file_bucket"] | null
          bytes?: number | null
          captured_at?: string | null
          classification_confidence?: number | null
          classified_by?: Database["public"]["Enums"]["classifier"] | null
          content_id?: string | null
          course_id?: string | null
          downloaded_at?: string | null
          file_name?: string | null
          id?: number | null
          link_confidence?: number | null
          local_path?: string | null
          mime_type?: string | null
          notes?: string | null
          path?: string | null
          reading_id?: number | null
          run_id?: string | null
          session_id?: number | null
          sha256?: string | null
          source_url?: string | null
          storage_path?: string | null
          superseded_by?: number | null
          text_status?: Database["public"]["Enums"]["text_status"] | null
          week_no?: number | null
        }
        Update: {
          assignment_id?: string | null
          bb_course_id?: string | null
          bb_modified_at?: string | null
          bucket?: Database["public"]["Enums"]["file_bucket"] | null
          bytes?: number | null
          captured_at?: string | null
          classification_confidence?: number | null
          classified_by?: Database["public"]["Enums"]["classifier"] | null
          content_id?: string | null
          course_id?: string | null
          downloaded_at?: string | null
          file_name?: string | null
          id?: number | null
          link_confidence?: number | null
          local_path?: string | null
          mime_type?: string | null
          notes?: string | null
          path?: string | null
          reading_id?: number | null
          run_id?: string | null
          session_id?: number | null
          sha256?: string | null
          source_url?: string | null
          storage_path?: string | null
          superseded_by?: number | null
          text_status?: Database["public"]["Enums"]["text_status"] | null
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_effort"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_upcoming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_files_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "bb_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "v_bb_files_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "v_file_layout"
            referencedColumns: ["id"]
          },
        ]
      }
      v_course_corpus: {
        Row: {
          bucket: Database["public"]["Enums"]["file_bucket"] | null
          course_id: string | null
          files: number | null
          stored: number | null
          title_short: string | null
          with_text: number | null
        }
        Relationships: []
      }
      v_course_display: {
        Row: {
          bb_url: string | null
          code: string | null
          display_id: string | null
          meetings: Json | null
          room_disputed: boolean | null
          shell_ids: string[] | null
          title: string | null
        }
        Relationships: []
      }
      v_course_map_latest: {
        Row: {
          course_id: string | null
          map: Json | null
          mapped_at: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_maps_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_maps_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_maps_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      v_course_points_median: {
        Row: {
          course_id: string | null
          display_course_id: string | null
          med: number | null
          n: number | null
          qualifies: boolean | null
        }
        Relationships: []
      }
      v_data_freshness: {
        Row: {
          fresh_as_of: string | null
          last_attempt_at: string | null
          last_attempt_failed: boolean | null
          stage: string | null
        }
        Relationships: []
      }
      v_embedding_status: {
        Row: {
          course_id: string | null
          embedding_rows: number | null
          last_embedded: string | null
          text_units: number | null
          units_embedded: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      v_file_layout: {
        Row: {
          assignment_id: string | null
          bucket: Database["public"]["Enums"]["file_bucket"] | null
          course_id: string | null
          file_name: string | null
          id: number | null
          local_path: string | null
          local_relpath: string | null
          needs_move: boolean | null
          relpath: string | null
          storage_key: string | null
          storage_path: string | null
          week_no: number | null
        }
        Insert: {
          assignment_id?: string | null
          bucket?: Database["public"]["Enums"]["file_bucket"] | null
          course_id?: string | null
          file_name?: string | null
          id?: number | null
          local_path?: string | null
          local_relpath?: never
          needs_move?: never
          relpath?: never
          storage_key?: never
          storage_path?: string | null
          week_no?: number | null
        }
        Update: {
          assignment_id?: string | null
          bucket?: Database["public"]["Enums"]["file_bucket"] | null
          course_id?: string | null
          file_name?: string | null
          id?: number | null
          local_path?: string | null
          local_relpath?: never
          needs_move?: never
          relpath?: never
          storage_key?: never
          storage_path?: string | null
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_effort"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_upcoming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "bb_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      v_overdue: {
        Row: {
          course_id: string | null
          due_at: string | null
          due_date: string | null
          id: string | null
          status: Database["public"]["Enums"]["progress_status"] | null
          title: string | null
          title_short: string | null
          type: Database["public"]["Enums"]["assignment_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      v_upcoming: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"] | null
          course_id: string | null
          due_at: string | null
          due_date: string | null
          due_rule: string | null
          id: string | null
          points_possible: number | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["progress_status"] | null
          title: string | null
          title_short: string | null
          type: Database["public"]["Enums"]["assignment_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_corpus"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_points_median"
            referencedColumns: ["course_id"]
          },
        ]
      }
      v_work_items: {
        Row: {
          category: string | null
          confidence: string | null
          course_id: string | null
          due_at: string | null
          due_on: string | null
          due_rule: string | null
          effort: number | null
          effort_source: string | null
          glyph: string | null
          in_workload: boolean | null
          is_override: boolean | null
          item_id: string | null
          item_kind: string | null
          multiplier_applied: boolean | null
          points_possible: number | null
          priority: string | null
          sequence_no: number | null
          series_key: string | null
          status: string | null
          submission: string | null
          suggested_start: string | null
          title: string | null
          type: string | null
          undated: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      app_owner: { Args: never; Returns: string }
      bb_file_relpath: { Args: { p_file_id: number }; Returns: string }
      classify_bb_file: {
        Args: { p_mime: string; p_name: string; p_path: string }
        Returns: Database["public"]["Enums"]["file_bucket"]
      }
      hybrid_search_file_text: {
        Args: {
          p_course?: string
          p_include_superseded?: boolean
          p_limit?: number
          p_min_similarity?: number
          p_model?: string
          q: string
          query_embedding: string
          rrf_k?: number
        }
        Returns: {
          bucket: Database["public"]["Enums"]["file_bucket"]
          course_id: string
          file_id: number
          file_name: string
          part_no: number
          score: number
          similarity: number
          snippet: string
          snippet_source: string
          text_id: number
          unit_kind: string
          unit_no: number
        }[]
      }
      match_file_text: {
        Args: {
          p_course?: string
          p_include_superseded?: boolean
          p_limit?: number
          p_model: string
          query_embedding: string
        }
        Returns: {
          bucket: Database["public"]["Enums"]["file_bucket"]
          course_id: string
          file_id: number
          file_name: string
          part_no: number
          similarity: number
          text: string
          text_id: number
          unit_kind: string
          unit_no: number
        }[]
      }
      search_file_text: {
        Args: {
          p_course?: string
          p_include_superseded?: boolean
          p_limit?: number
          q: string
        }
        Returns: {
          bucket: Database["public"]["Enums"]["file_bucket"]
          course_id: string
          file_id: number
          file_name: string
          rank: number
          snippet: string
          text_id: number
          unit_kind: string
          unit_no: number
        }[]
      }
      suggested_start: {
        Args: { p_course_id: string; p_due: string; p_effort: number }
        Returns: string
      }
    }
    Enums: {
      aggregation_rule:
        | "sum"
        | "average"
        | "average_drop_lowest"
        | "rank_weighted"
        | "normalized"
        | "single"
        | "manual"
        | "unknown"
      assignment_type:
        | "exam"
        | "final_exam"
        | "quiz"
        | "lab"
        | "homework"
        | "reading"
        | "presentation"
        | "group_presentation"
        | "project"
        | "paper"
        | "discussion_post"
        | "form"
        | "checkpoint"
        | "meeting"
        | "evaluation"
        | "activity"
        | "attendance"
        | "participation"
        | "other"
      classifier: "rule" | "agent" | "stack"
      confidence_level: "confirmed" | "tentative" | "inferred"
      course_kind:
        | "lecture"
        | "recitation"
        | "lab"
        | "seminar"
        | "internship"
        | "online"
      data_source:
        | "syllabus"
        | "course_deck"
        | "blackboard"
        | "ical"
        | "manual"
        | "inferred"
      file_bucket:
        | "syllabus_policy"
        | "schedule"
        | "lecture_slides"
        | "readings"
        | "assignment_spec"
        | "lab_materials"
        | "project_materials"
        | "my_submissions"
        | "admin"
        | "media_links"
        | "unclassified"
      grading_method: "weighted_pct" | "points" | "qualitative" | "unknown"
      priority_level: "low" | "normal" | "high" | "critical"
      progress_status:
        | "not_started"
        | "planned"
        | "in_progress"
        | "submitted"
        | "graded"
        | "missed"
        | "excused"
        | "not_applicable"
        | "waived"
      recurrence_kind: "one_off" | "recurring"
      session_kind:
        | "lecture"
        | "exam"
        | "lab"
        | "presentation"
        | "practice"
        | "guest"
        | "no_class"
        | "discussion"
        | "other"
      staff_role:
        | "instructor"
        | "ta"
        | "coordinator"
        | "faculty_sponsor"
        | "site_supervisor"
        | "guest"
      submission_channel:
        | "blackboard"
        | "in_class"
        | "email"
        | "external_site"
        | "discussion_board"
        | "none"
        | "unknown"
      syllabus_status: "complete" | "partial" | "missing"
      text_status: "pending" | "extracted" | "failed" | "na"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      aggregation_rule: [
        "sum",
        "average",
        "average_drop_lowest",
        "rank_weighted",
        "normalized",
        "single",
        "manual",
        "unknown",
      ],
      assignment_type: [
        "exam",
        "final_exam",
        "quiz",
        "lab",
        "homework",
        "reading",
        "presentation",
        "group_presentation",
        "project",
        "paper",
        "discussion_post",
        "form",
        "checkpoint",
        "meeting",
        "evaluation",
        "activity",
        "attendance",
        "participation",
        "other",
      ],
      classifier: ["rule", "agent", "stack"],
      confidence_level: ["confirmed", "tentative", "inferred"],
      course_kind: [
        "lecture",
        "recitation",
        "lab",
        "seminar",
        "internship",
        "online",
      ],
      data_source: [
        "syllabus",
        "course_deck",
        "blackboard",
        "ical",
        "manual",
        "inferred",
      ],
      file_bucket: [
        "syllabus_policy",
        "schedule",
        "lecture_slides",
        "readings",
        "assignment_spec",
        "lab_materials",
        "project_materials",
        "my_submissions",
        "admin",
        "media_links",
        "unclassified",
      ],
      grading_method: ["weighted_pct", "points", "qualitative", "unknown"],
      priority_level: ["low", "normal", "high", "critical"],
      progress_status: [
        "not_started",
        "planned",
        "in_progress",
        "submitted",
        "graded",
        "missed",
        "excused",
        "not_applicable",
        "waived",
      ],
      recurrence_kind: ["one_off", "recurring"],
      session_kind: [
        "lecture",
        "exam",
        "lab",
        "presentation",
        "practice",
        "guest",
        "no_class",
        "discussion",
        "other",
      ],
      staff_role: [
        "instructor",
        "ta",
        "coordinator",
        "faculty_sponsor",
        "site_supervisor",
        "guest",
      ],
      submission_channel: [
        "blackboard",
        "in_class",
        "email",
        "external_site",
        "discussion_board",
        "none",
        "unknown",
      ],
      syllabus_status: ["complete", "partial", "missing"],
      text_status: ["pending", "extracted", "failed", "na"],
    },
  },
} as const
