import 'package:flutter/material.dart';
import 'package:radar_app/Shared/Controls/container_decoration.dart';
import 'package:radar_app/Shared/Controls/get_appBar.dart';
import 'package:radar_app/Shared/Controls/get_text.dart';
import 'package:radar_app/Shared/Extensions/extensions.dart';
import 'package:radar_app/Shared/Theme/themeColors.dart';
import '../../../Shared/Resources/strings.dart';

class PermitTestHistoryDetailScreen extends StatelessWidget {
  final List<dynamic> details;

  const PermitTestHistoryDetailScreen(this.details, {super.key});

  @override
  Widget build(BuildContext context) {
    final correctCount = details.where((response) => response['userAnswer'] == response['correctAnswer']).length;
    return Scaffold(
      appBar: getAppBar(testResult, color: transparentColor, centerTitle: true),
      body: Padding(
        padding: EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: secondaryColor,
                borderRadius: radiusValueTen,
              ),
              child: Column(
                children: [
                  GetText(
                    text: '$correctCount/20',
                    fontSize: context.responsiveFontSize(45),
                    fontWeight: FontWeight.bold,
                    color: whiteColor,
                  ),
                  10.pixelHeight,
                  GetText(
                    text: correctAnswers,
                    fontSize: context.responsiveFontSize(16),
                    color: greyColor,
                  ),
                ],
              ).paddingVertical(16),
            ),
            16.pixelHeight,
            GetText(
              text: reviewYourResponsesBelow,
              fontSize: context.responsiveFontSize(16),
              color: greyColor,
            ),
            16.pixelHeight,
            Expanded(
              child: ListView.builder(
                itemCount: details.length,
                itemBuilder: (context, index) {
                  final response = details[index];
                  final isCorrect = response['userAnswer'] == response['correctAnswer'];
                  return Container(
                    margin: EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: secondaryColor,
                      borderRadius: radiusValueTen,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            GetText(
                              text: '#${index + 1}',
                              fontSize: context.responsiveFontSize(16),
                              color: whiteColor,
                            ),
                            10.pixelWidth,
                            Container(
                              decoration: BoxDecoration(
                                color: isCorrect ? Colors.green : Colors.red,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: GetText(
                                text: isCorrect ? correct : inCorrect,
                                color: whiteColor,
                              ).paddingHorizontal(8),
                            ),
                          ],
                        ),
                        10.pixelHeight,
                        GetText(
                          text: response['question'] ?? '',
                          fontSize: context.responsiveFontSize(16),
                          color: whiteColor,
                          fontWeight: FontWeight.bold,
                        ),
                        10.pixelHeight,
                        GetText(
                          text: '$yourAnswer:',
                          fontSize: context.responsiveFontSize(14),
                          color: greyColor,
                        ),
                        10.pixelHeight,
                        GetText(
                          text: response['userAnswer'] ?? 'N/A',
                          fontSize: context.responsiveFontSize(14),
                          color: isCorrect ? Colors.green : Colors.red,
                        ),
                        if (!isCorrect) ...[
                          10.pixelHeight,
                          GetText(
                            text: '$correctAnswer:',
                            fontSize: context.responsiveFontSize(14),
                            color: greyColor,
                          ),
                          10.pixelHeight,
                          GetText(
                            text: response['correctAnswer'] ?? 'N/A',
                            fontSize: context.responsiveFontSize(14),
                            color: Colors.green,
                          ),
                        ],
                      ],
                    ).paddingAll(12),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}