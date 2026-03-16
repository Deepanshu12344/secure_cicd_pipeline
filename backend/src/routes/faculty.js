import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';

import Submission from '../models/Submission.js';
import Student from '../models/Student.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
const uploadsDir = path.resolve(process.cwd(), 'backend/uploads/faculty-reports');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = String(file.originalname || 'report.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

const gradeFromRisk = (riskScore) => {
  if (riskScore < 30) return 'A';
  if (riskScore < 60) return 'B';
  if (riskScore < 80) return 'C';
  return 'Fail';
};

const ensureFaculty = (req, res, next) => {
  if (!req.user || req.user.role !== 'faculty') {
    return res.status(403).json({ success: false, error: 'Faculty access required' });
  }
  return next();
};

const ensureIngestKey = (req, res, next) => {
  const expected = process.env.CI_INGEST_API_KEY;
  const provided = String(req.headers['x-api-key'] || '').trim();

  if (!expected) {
    return res.status(500).json({ success: false, error: 'CI_INGEST_API_KEY is not configured on server' });
  }

  if (provided !== expected) {
    return res.status(401).json({ success: false, error: 'Invalid ingest API key' });
  }

  return next();
};

const normalizeSummary = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const upsertStudentFromSubmission = async ({ studentId, repoName, email }) => {
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedRepo = String(repoName || '').trim();
  const normalizedEmail = String(email || `${normalizedStudentId}@example.edu`).trim().toLowerCase();

  const existing = await Student.findOne({ studentId: normalizedStudentId });
  if (existing) {
    if (normalizedRepo && existing.githubRepo !== normalizedRepo) {
      existing.githubRepo = normalizedRepo;
    }
    if (normalizedEmail && existing.email !== normalizedEmail) {
      existing.email = normalizedEmail;
    }
    await existing.save();
    return existing;
  }

  return Student.create({
    studentId: normalizedStudentId,
    name: normalizedStudentId,
    githubRepo: normalizedRepo,
    email: normalizedEmail
  });
};

const serializeSubmission = (entry) => ({
  id: String(entry._id),
  student_id: entry.studentId,
  repo_name: entry.repoName,
  commit_hash: entry.commitHash,
  risk_score: entry.riskScore,
  vulnerabilities: entry.vulnerabilities || {},
  timestamp: entry.timestamp,
  auto_grade: entry.autoGrade,
  faculty_grade: entry.facultyGrade,
  faculty_feedback: entry.facultyFeedback,
  report_file_url: entry.reportFilePath ? `/api/submissions/${entry._id}/report-file` : null
});

router.post('/submit-report', ensureIngestKey, upload.single('report_file'), async (req, res) => {
  try {
    const studentId = String(req.body.student_id || '').trim();
    const repoName = String(req.body.repo_name || '').trim();
    const commitHash = String(req.body.commit_hash || '').trim();
    const riskScore = Number(req.body.risk_score);

    if (!studentId || !repoName || !commitHash || Number.isNaN(riskScore)) {
      return res.status(400).json({
        success: false,
        error: 'student_id, repo_name, commit_hash, risk_score are required'
      });
    }

    await upsertStudentFromSubmission({ studentId, repoName });

    const submission = await Submission.create({
      studentId,
      repoName,
      commitHash,
      riskScore,
      vulnerabilities: normalizeSummary(req.body.vulnerability_summary),
      timestamp: new Date(),
      autoGrade: gradeFromRisk(riskScore),
      reportFilePath: req.file ? req.file.path : null
    });

    return res.status(201).json({
      success: true,
      data: {
        submission_id: String(submission._id),
        auto_grade: submission.autoGrade
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit report' });
  }
});

router.post('/submit-report-json', ensureIngestKey, async (req, res) => {
  try {
    const studentId = String(req.body.student_id || '').trim();
    const repoName = String(req.body.repo_name || '').trim();
    const commitHash = String(req.body.commit_hash || '').trim();
    const riskScore = Number(req.body.risk_score);

    if (!studentId || !repoName || !commitHash || Number.isNaN(riskScore)) {
      return res.status(400).json({
        success: false,
        error: 'student_id, repo_name, commit_hash, risk_score are required'
      });
    }

    await upsertStudentFromSubmission({ studentId, repoName });

    const submission = await Submission.create({
      studentId,
      repoName,
      commitHash,
      riskScore,
      vulnerabilities: normalizeSummary(req.body.vulnerability_summary),
      timestamp: new Date(),
      autoGrade: gradeFromRisk(riskScore)
    });

    return res.status(201).json({
      success: true,
      data: {
        submission_id: String(submission._id),
        auto_grade: submission.autoGrade
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit report' });
  }
});

router.get('/students', protect, ensureFaculty, async (_req, res) => {
  try {
    const students = await Student.find().sort({ name: 1 }).lean();

    const rows = await Promise.all(
      students.map(async (student) => {
        const latest = await Submission.findOne({ studentId: student.studentId }).sort({ timestamp: -1 }).lean();
        return {
          id: String(student._id),
          student_id: student.studentId,
          name: student.name,
          github_repo: student.githubRepo,
          email: student.email,
          latest_risk_score: latest ? latest.riskScore : null,
          latest_auto_grade: latest ? latest.autoGrade : null,
          latest_submission_id: latest ? String(latest._id) : null
        };
      })
    );

    return res.json({ success: true, data: { students: rows } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch students' });
  }
});

router.get('/student/:id', protect, async (req, res) => {
  try {
    const studentId = String(req.params.id || '').trim();

    if (req.user.role === 'student' && req.user.studentId !== studentId) {
      return res.status(403).json({ success: false, error: 'Students can only view their own reports' });
    }

    if (req.user.role !== 'faculty' && req.user.role !== 'student') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const student = await Student.findOne({ studentId }).lean();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const submissions = await Submission.find({ studentId }).sort({ timestamp: 1 }).lean();

    return res.json({
      success: true,
      data: {
        student: {
          id: String(student._id),
          student_id: student.studentId,
          name: student.name,
          github_repo: student.githubRepo,
          email: student.email
        },
        submissions: submissions.map(serializeSubmission)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch student details' });
  }
});

router.post('/assign-grade', protect, ensureFaculty, async (req, res) => {
  try {
    const submissionId = String(req.body.submission_id || '').trim();
    const facultyGrade = req.body.faculty_grade ? String(req.body.faculty_grade).trim() : null;
    const facultyFeedback = req.body.faculty_feedback ? String(req.body.faculty_feedback).trim() : null;

    if (!submissionId || !mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ success: false, error: 'Valid submission_id is required' });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (facultyGrade && !['A', 'B', 'C', 'Fail'].includes(facultyGrade)) {
      return res.status(400).json({ success: false, error: 'faculty_grade must be A, B, C, or Fail' });
    }

    submission.facultyGrade = facultyGrade || submission.autoGrade;
    submission.facultyFeedback = facultyFeedback || null;
    submission.gradedBy = req.user._id;
    submission.gradedAt = new Date();

    await submission.save();

    return res.json({
      success: true,
      data: {
        submission_id: String(submission._id),
        auto_grade: submission.autoGrade,
        faculty_grade: submission.facultyGrade,
        faculty_feedback: submission.facultyFeedback
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to assign grade' });
  }
});

router.get('/submissions/:submissionId/report-file', protect, async (req, res) => {
  try {
    const submissionId = String(req.params.submissionId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ success: false, error: 'Invalid submission id' });
    }

    const submission = await Submission.findById(submissionId).lean();
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (req.user.role === 'student' && req.user.studentId !== submission.studentId) {
      return res.status(403).json({ success: false, error: 'Students can only view their own reports' });
    }

    if (req.user.role !== 'faculty' && req.user.role !== 'student') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!submission.reportFilePath || !fs.existsSync(submission.reportFilePath)) {
      return res.status(404).json({ success: false, error: 'Report file not found' });
    }

    return res.sendFile(path.resolve(submission.reportFilePath));
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch report file' });
  }
});

router.get('/analytics/class-summary', protect, ensureFaculty, async (_req, res) => {
  try {
    const submissions = await Submission.find().lean();
    if (!submissions.length) {
      return res.json({ success: true, data: { total_submissions: 0, average_risk_score: 0, grade_distribution: {} } });
    }

    const average = submissions.reduce((acc, item) => acc + (item.riskScore || 0), 0) / submissions.length;
    const gradeDistribution = {};

    submissions.forEach((item) => {
      const grade = item.facultyGrade || item.autoGrade;
      gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
    });

    return res.json({
      success: true,
      data: {
        total_submissions: submissions.length,
        average_risk_score: Number(average.toFixed(2)),
        grade_distribution: gradeDistribution
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch class summary' });
  }
});

router.get('/analytics/leaderboard', protect, ensureFaculty, async (_req, res) => {
  try {
    const students = await Student.find().lean();

    const leaderboard = await Promise.all(
      students.map(async (student) => {
        const submissions = await Submission.find({ studentId: student.studentId }).lean();
        if (!submissions.length) return null;

        const average = submissions.reduce((acc, item) => acc + (item.riskScore || 0), 0) / submissions.length;

        return {
          student_id: student.studentId,
          name: student.name,
          avg_risk_score: Number(average.toFixed(2)),
          submission_count: submissions.length
        };
      })
    );

    const rows = leaderboard.filter(Boolean).sort((a, b) => a.avg_risk_score - b.avg_risk_score);
    return res.json({ success: true, data: { leaderboard: rows } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch leaderboard' });
  }
});

router.get('/grades/export-csv', protect, ensureFaculty, async (_req, res) => {
  try {
    const submissions = await Submission.find().lean();

    const lines = [
      'student_id,commit_hash,risk_score,auto_grade,faculty_grade,faculty_feedback',
      ...submissions.map((item) => {
        const feedback = String(item.facultyFeedback || '').replace(/"/g, '""');
        return [
          item.studentId,
          item.commitHash,
          item.riskScore,
          item.autoGrade,
          item.facultyGrade || '',
          `"${feedback}"`
        ].join(',');
      })
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=grades.csv');
    return res.send(lines.join('\n'));
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to export CSV' });
  }
});

export default router;
