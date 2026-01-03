import 'dart:math';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:radar_app/Shared/Controls/container_decoration.dart';
import 'package:radar_app/Shared/Controls/get_appBar.dart';
import 'package:radar_app/Shared/Controls/get_text.dart';
import 'package:radar_app/Shared/Extensions/extensions.dart';
import 'package:radar_app/Shared/Theme/themeColors.dart';
import 'package:hive/hive.dart';
import 'package:radar_app/Views/PermitTestPrep/History/permit_test_history_detail_screen.dart';

import '../../../Providers/permit_test_provider.dart';
import '../../../Shared/Controls/alert_dialog.dart';
import '../../../Shared/Controls/trash_btn.dart';
import '../../../Shared/Resources/strings.dart';

class PermitTestHistoryScreen extends StatelessWidget {
  const PermitTestHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<PermitTestProvider>(
      builder: (context, provider, child) {
        return Scaffold(
          appBar: getAppBar(
            testHistory,
            color: transparentColor,
            actions: [
              Consumer<PermitTestProvider>(
                builder: (BuildContext context, provider, Widget? child) {
                  return provider.permitTestDB.isNotEmpty
                      ? TrashBtn(
                        onTap: () {
                          deletePermitHistoryDialog(context);
                        },
                      )
                      : 0.pixelWidth;
                },
              ),
              15.pixelWidth,
            ],
          ),
          body: FutureBuilder(
            future: Hive.openBox('quizResults'),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return Center(child: CircularProgressIndicator());
              }
              final box = snapshot.data as Box;
              final results = box.values.toList();

              if (results.isEmpty) {
                return Center(child: GetText(text: noHistoryAvailable, fontSize: context.responsiveFontSize(16), color: greyColor));
              }

              return ListView.builder(
                padding: EdgeInsets.all(16.0),
                itemCount: results.length,
                itemBuilder: (context, index) {
                  final result = results[index];
                  final correctCount = result['correctCount'];
                  Color scoreColor;
                  if (correctCount >= 17) {
                    scoreColor = Colors.green;
                  } else if (correctCount >= 13) {
                    scoreColor = yellowColor;
                  } else {
                    scoreColor = redColor;
                  }
                  return ListTile(
                    onTap: () {
                      context.pushTo(PermitTestHistoryDetailScreen(result['details']));
                    },
                    tileColor: secondaryColor,
                    shape: RoundedRectangleBorder(borderRadius: radiusValueTen),
                    title: GetText(text: '$test #${index+1}', color: whiteColor, fontWeight: FontWeight.bold),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          decoration: BoxDecoration(color: scoreColor, borderRadius: BorderRadius.circular(6)),
                          child: GetText(
                            text: '$correctCount/20',
                            fontSize: context.responsiveFontSize(16),
                            color: whiteColor,
                          ).paddingHorizontal(8).paddingVertical(2),
                        ),
                        10.pixelWidth,
                        Transform.translate(
                          offset: Offset(context.width * 0.03, 0),
                          child: Icon(Icons.arrow_forward_ios, color: greyColor, size: context.width * 0.06),
                        ),
                      ],
                    ),
                  ).paddingBottom(16);
                },
              );
            },
          ),
        );
      },
    );
  }
}
