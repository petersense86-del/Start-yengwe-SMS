import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Result, User, SchoolSettings } from "../types";
import type { Role } from "../data/constants";
import { yengweGrade } from "../types";
import { getDb, logActivity, saveDb } from "./db";

export function generateResultPDF(
  result: Result,
  pupil: User,
  downloadedBy: User,
  settings: SchoolSettings
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ========================================================
  // BACKGROUND FAINT WATERMARK (uploaded by Head/Deputy, falls back to school logo)
  // Drawn FIRST and only as a background; all other content sits on top.
  // Low opacity (configurable, default 4%) ensures all important info is readable.
  // ========================================================
  if (settings.watermarkEnabled !== false) {
    const watermarkSrc = settings.watermarkImage || settings.schoolLogo;
    if (watermarkSrc) {
      try {
        const GState = (jsPDF as any).GState || (jsPDF as any).API?.GState;
        const opacity = Math.max(0.01, Math.min(0.25, settings.watermarkOpacity ?? 0.04));
        if (typeof doc.setGState === "function" && GState) {
          doc.saveGraphicsState?.();
          doc.setGState(new GState({ opacity }));
        }
        const wmSize = 150;
        const wmX = (pageWidth - wmSize) / 2;
        const wmY = (pageHeight - wmSize) / 2 - 10;
        doc.addImage(watermarkSrc, "PNG", wmX, wmY, wmSize, wmSize);
        if (typeof doc.setGState === "function" && GState) {
          doc.restoreGraphicsState?.();
        }
      } catch { /* ignore */ }
    }
  }

  // Header
  doc.setFillColor(13, 92, 46); // emerald-900
  doc.rect(0, 0, pageWidth, 30, "F");

  // Logo circle area
  doc.setFillColor(255, 255, 255);
  doc.circle(20, 15, 10, "F");
  if (settings.schoolLogo) {
    try {
      doc.addImage(settings.schoolLogo, "PNG", 11, 6, 18, 18);
    } catch {}
  } else {
    doc.setTextColor(13, 92, 46);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text("Y", 20, 20, { align: "center" });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("YENGWE SECONDARY SCHOOL", pageWidth / 2 + 10, 13, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Pupil End-of-Term Report Card", pageWidth / 2 + 10, 20, { align: "center" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(`Motto: ${settings.schoolMotto}`, pageWidth / 2 + 10, 26, { align: "center" });

  // Pupil info (no guardian, phone, province, district, class, or date of birth)
  const startY = 38;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Pupil Information", 14, startY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const infoLines: [string, string, string, string][] = [
    ["Name:", pupil.fullName, "Pupil ID:", pupil.pupilId || "N/A"],
    ["Grade:", result.grade, "Term:", `${result.term} ${result.year}`],
    ["Gender:", pupil.gender || "N/A", "", ""],
  ];

  let y = startY + 5;
  infoLines.forEach((row) => {
    doc.setFont("helvetica", "bold");
    doc.text(row[0], 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(row[1]), 30, y);
    if (row[2]) {
      doc.setFont("helvetica", "bold");
      doc.text(row[2], 110, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(row[3]), 135, y);
    }
    y += 6;
  });

  // Results table - only include PUBLISHED subjects
  const publishedScores = result.scores.filter((s) => s.published);

  const tableData = publishedScores.map((s, i) => {
    const g = yengweGrade(s.score);
    return [i + 1, s.subject, s.score.toString(), g.grade, g.name, s.teacherName];
  });

  autoTable(doc, {
    startY: y + 3,
    head: [["#", "Subject", "Score (%)", "Grade", "Remark", "Subject Teacher"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [13, 92, 46], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { cellWidth: 22 },
      3: { cellWidth: 18 },
    },
  });

  // Summary (based on published scores only)
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const totalScore = publishedScores.reduce((sum, s) => sum + s.score, 0);
  const avg = publishedScores.length > 0 ? totalScore / publishedScores.length : 0;
  const avgGrade = yengweGrade(avg);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary", 14, finalY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const color = avg < 40 ? [220, 38, 38] : avg < 55 ? [234, 179, 8] : [22, 163, 74];
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFont("helvetica", "bold");
  doc.text(`Average Score: ${avg.toFixed(1)}%  (Grade ${avgGrade.grade} - ${avgGrade.name})`, 14, finalY + 6);
  doc.text(`Subjects Published: ${publishedScores.length}`, 14, finalY + 12);
  doc.setTextColor(30, 30, 30);

  // Behaviour / class-teacher comment
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Class Teacher's Comment (Behaviour & Attitude):", 14, finalY + 22);
  doc.setFont("helvetica", "normal");
  const commentText = result.classTeacherComment?.trim() || "No comment provided.";
  // draw box around comment
  const commentY = finalY + 25;
  const boxH = Math.max(18, 10 + Math.ceil(commentText.length / 95) * 5);
  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.rect(14, commentY, pageWidth - 28, boxH);
  doc.text(commentText, 17, commentY + 5, { maxWidth: pageWidth - 34 });

  // Look up the class teacher for their signature
  const db = getDb();
  const classTeacherId = result.classTeacherId || publishedScores[0]?.teacherId;
  const classTeacher = db.users.find((u) => u.id === classTeacherId);
  const classTeacherName = classTeacher?.fullName || publishedScores[0]?.teacherName || "Class Teacher";

  // Signature area (placed after comment box)
  const sigY = commentY + boxH + 12;
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.line(14, sigY, 80, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  // Class teacher signature image (if uploaded)
  if (classTeacher?.signature) {
    try {
      doc.addImage(classTeacher.signature, "PNG", 20, sigY - 16, 55, 18);
    } catch {}
  }
  doc.text("Class Teacher Signature", 14, sigY + 4);
  doc.text(classTeacherName, 14, sigY + 9);
  doc.text("Date: _______________", 14, sigY + 14);

  doc.line(110, sigY, pageWidth - 14, sigY);
  if (settings.headteacherSignature) {
    try {
      doc.addImage(settings.headteacherSignature, "PNG", 120, sigY - 18, 50, 20);
    } catch {}
  }
  doc.text("Headteacher Signature", 110, sigY + 4);
  doc.text(settings.headteacherName, 110, sigY + 9);
  doc.text("Date: _______________", 110, sigY + 14);

  // ========================================================
  // CUSTOMIZABLE OFFICIAL DESK STAMP (Head-editable shape/size/color/date/position)
  // ========================================================
  if (settings.stampEnabled) {
    const stampR = settings.stampSize ?? 18;
    const stampX = pageWidth - (settings.stampXOffset ?? 38);
    const stampY = sigY + (settings.stampYOffset ?? 2);
    const stampColor = settings.stampColor || "#B41414";
    const hex = stampColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const gc = parseInt(hex.substring(2, 4), 16);
    const bc = parseInt(hex.substring(4, 6), 16);

    doc.setDrawColor(r, gc, bc);
    doc.setTextColor(r, gc, bc);
    doc.setLineWidth(1.2);

    const shape = settings.stampShape || "round";
    if (shape === "round") {
      doc.circle(stampX, stampY, stampR, "S");
      doc.setLineWidth(0.4);
      doc.circle(stampX, stampY, Math.max(3, stampR - 3), "S");
    } else if (shape === "square") {
      doc.rect(stampX - stampR, stampY - stampR, stampR * 2, stampR * 2, "S");
      doc.setLineWidth(0.4);
      doc.rect(stampX - (stampR - 3), stampY - (stampR - 3), (stampR - 3) * 2, (stampR - 3) * 2, "S");
    } else if (shape === "hexagon") {
      const size = stampR;
      const pts: number[][] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 2;
        pts.push([stampX + size * Math.cos(ang), stampY + size * Math.sin(ang)]);
      }
      doc.lines(pts.map((p, i) => i === 0 ? [0, 0] : [p[0] - pts[0][0], p[1] - pts[0][1]]), pts[0][0], pts[0][1], [1, 1], "S");
      doc.setLineWidth(0.4);
      const size2 = Math.max(3, stampR - 3);
      const pts2: number[][] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 2;
        pts2.push([stampX + size2 * Math.cos(ang), stampY + size2 * Math.sin(ang)]);
      }
      doc.lines(pts2.map((p, i) => i === 0 ? [0, 0] : [p[0] - pts2[0][0], p[1] - pts2[0][1]]), pts2[0][0], pts2[0][1], [1, 1], "S");
    }

    // Center logo / monogram (scaled to stamp size)
    const centerSize = Math.min(14, stampR * 0.7);
    if (settings.schoolLogo) {
      try {
        doc.addImage(settings.schoolLogo, "PNG", stampX - centerSize / 2, stampY - centerSize / 2, centerSize, centerSize);
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(Math.max(6, Math.min(10, stampR * 0.5)));
        doc.text("YSS", stampX, stampY + 1, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(Math.max(6, Math.min(10, stampR * 0.5)));
      doc.text("YSS", stampX, stampY + 1, { align: "center" });
    }
    // Curved/top text scaled to size
    doc.setFont("helvetica", "bold");
    doc.setFontSize(Math.max(4.5, Math.min(7, stampR * 0.33)));
    doc.text(settings.stampText || "YENGWE SECONDARY SCHOOL", stampX, stampY - stampR + 5, { align: "center" });
    doc.setFontSize(Math.max(4, Math.min(6, stampR * 0.3)));
    doc.text("OFFICIAL STAMP", stampX, stampY + stampR - 3, { align: "center" });
    if (settings.stampShowDate && settings.stampDate) {
      doc.setFontSize(Math.max(4, Math.min(5.5, stampR * 0.27)));
      doc.text(settings.stampDate, stampX, stampY - stampR + 9, { align: "center" });
    }
  }

  // reset
  doc.setLineWidth(0.2);
  doc.setTextColor(30, 30, 30);

  // Footer with download info
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Downloaded by: ${downloadedBy.fullName} (${downloadedBy.role.toUpperCase()})`, 14, pageHeight - 8);
  doc.text(`Downloaded on: ${new Date().toLocaleString()}`, pageWidth - 14, pageHeight - 8, { align: "right" });
  doc.text(`© Yengwe Secondary School • ${settings.systemDomain || "smart yengwe.sch"}`, pageWidth / 2, pageHeight - 8, { align: "center" });

  // Log the download (reuse db from earlier)
  db.downloadLogs.unshift({
    id: `dl-${Date.now()}`,
    resultId: result.id,
    pupilName: pupil.fullName,
    downloadedBy: downloadedBy.id,
    downloadedByName: downloadedBy.fullName,
    downloadedAt: new Date().toISOString(),
    role: downloadedBy.role,
  });
  saveDb(db);
  logActivity(downloadedBy.id, downloadedBy.fullName, downloadedBy.role as Role, `Downloaded results for ${pupil.fullName}`, `${result.term} ${result.year}`);

  // Save
  const filename = `YPMS_${pupil.fullName.replace(/\s+/g, "_")}_${result.term}_${result.year}.pdf`;
  doc.save(filename);
}
