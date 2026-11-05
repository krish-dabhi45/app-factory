// The team's showLog / showToast / appText (AI PPT lib/widgets/custom_widgets.dart) and the font name appText uses
// (lib/service/app_constant.dart), for an app that has none. Built by ads-install.mjs template, never edited.
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:fluttertoast/fluttertoast.dart';

const fontFamilyMedium = 'Medium';

void showLog(String msg) {
  if (msg != "") {
    debugPrint(msg);
  }
}

void showToast(String msg, {bool isShowBlack = false}) {
  Fluttertoast.showToast(msg: msg, textColor: isShowBlack ? Colors.white : Colors.black, backgroundColor: isShowBlack ? Colors.black : Colors.white, fontSize: 45.sp, toastLength: Toast.LENGTH_SHORT);
}

Widget appText({required String title, double? fs, String? family, Color? color, FontWeight? weight, FontStyle? style, TextAlign? textAlign, int? line, TextDecoration? tDecoration, Color? tdColor, double? tdThickness, Paint? fourGround}) {
  return Text(
    title,
    textAlign: textAlign ?? TextAlign.center,
    maxLines: line,
    overflow: line == null ? TextOverflow.visible : TextOverflow.ellipsis,
    style: TextStyle(decoration: tDecoration, decorationColor: tdColor, decorationThickness: tdThickness, color: fourGround != null ? null : color ?? Colors.black, fontSize: fs ?? 45.sp, fontFamily: family ?? fontFamilyMedium, fontStyle: style ?? FontStyle.normal, fontWeight: weight ?? FontWeight.normal, foreground: fourGround),
  );
}
