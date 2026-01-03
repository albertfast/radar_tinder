import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:radar_app/Providers/permit_test_provider.dart';
import 'package:radar_app/Shared/Controls/container_decoration.dart';
import 'package:radar_app/Shared/Controls/get_button.dart';
import 'package:radar_app/Shared/Controls/history_btn.dart';
import 'package:radar_app/Shared/Extensions/extensions.dart';
import 'package:radar_app/Shared/Resources/strings.dart';
import 'package:radar_app/Shared/Theme/themeColors.dart';

import '../../Providers/ads_provider.dart';
import '../../Shared/Controls/get_text.dart';
import '../../Shared/Controls/premium_btn.dart';
import 'History/permit_test_history_screen.dart';
import 'disclaimer_screen.dart';

class StateSelectScreen extends StatefulWidget {
  const StateSelectScreen({super.key});

  @override
  _StateSelectScreenState createState() => _StateSelectScreenState();
}

class _StateSelectScreenState extends State<StateSelectScreen> {
  final TextEditingController _searchController = TextEditingController();
  List<String> _filteredStates = [];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: InkWell(
        splashColor: transparentColor,
        focusColor: transparentColor,
        highlightColor: transparentColor,
        onTap: ()=>FocusScope.of(context).unfocus(),
        child: SafeArea(
          child: Consumer<PermitTestProvider>(
            builder: (context, provider, child) {
              if (provider.isLoading) {
                return Center(child: CircularProgressIndicator(color: primaryColor,));
              }

              if (provider.errorMessage != null) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(provider.errorMessage!)));
                });
              }
              _filteredStates =
              _searchController.text.isEmpty
                  ? provider.states
                  : provider.states.where((state) => state.toLowerCase().contains(_searchController.text.toLowerCase())).toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: GestureDetector(onTap: ()=>Navigator.pop(context),child: Icon(Icons.arrow_back_ios_new,color: whiteColor,)),
                    title: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        GetText(text: permitTestPrep, fontWeight: FontWeight.bold, fontSize: context.responsiveFontSize(18)),
                        Row(mainAxisSize: MainAxisSize.min, children: [const PremiumBtn(), 5.pixelWidth,HistoryBtn(onTap: ()=>context.pushTo(const PermitTestHistoryScreen()))]),
                      ],
                    ),
                    subtitle: GetText(text: selectYourStateToContinue,color: whiteColor,),
                  ),
                  16.pixelHeight,
                  if (provider.recentState != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        GetText(text: recentlyUsed, fontSize: context.responsiveFontSize(18), fontWeight: FontWeight.bold, color: whiteColor),
                        16.pixelHeight,
                        ListTile(
                          onTap: () {
                            provider.setSelectedState(provider.recentState);
                          },
                          tileColor: secondaryColor,
                          title: GetText(
                            text: provider.recentState!,
                            fontSize: context.responsiveFontSize(16),
                            color: whiteColor,
                            fontWeight: FontWeight.bold,
                          ),
                          trailing: provider.recentState == provider.selectedState?Icon(Icons.check,color: primaryColor,):0.pixelWidth,
                          shape: RoundedRectangleBorder(borderRadius: radiusValueTen,
                            side: BorderSide(color:  provider.recentState == provider.selectedState?primaryColor:transparentColor, width: 1),),
                        ),
                      ],
                    ),
                  16.pixelHeight,
                  ClipRRect(borderRadius: radiusValueTen,
                    child: TextField(
                      textAlignVertical: TextAlignVertical.center,
                      controller: _searchController,
                      cursorColor: primaryColor,
                      decoration: InputDecoration(
                        hintText: findYourState,
                        prefixIcon: Icon(Icons.search),
                        border: InputBorder.none,
                        fillColor: secondaryColor,
                        filled: true,
                      ),
                      onChanged: (value) {
                        setState(() {

                        }); // Trigger rebuild to update filtered states
                      },
                    ),
                  ),

                  16.pixelHeight,
                  GetText(text: allStates, fontSize: context.responsiveFontSize(18), fontWeight: FontWeight.bold, color: whiteColor),
                  16.pixelHeight,
                  Expanded(
                    child:
                        _filteredStates.isEmpty
                            ? Center(child: Text('No states found'))
                            : GridView.builder(
                              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 2,
                                crossAxisSpacing: 10,
                                mainAxisSpacing: 10,
                                childAspectRatio: 3,
                              ),
                              itemCount: _filteredStates.length,
                              itemBuilder: (context, index) {
                                final state = _filteredStates[index];
                                final isSelected = state == provider.selectedState;
                                return GestureDetector(
                                  onTap: () {
                                    provider.setSelectedState(state);
                                  },
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color:secondaryColor,
                                      border: Border.all(color: isSelected ? Colors.blue : transparentColor),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Center(
                                      child: GetText( 
                                        text:state,
                                        fontSize: context.responsiveFontSize(16), color: whiteColor,
                                        textAlign: TextAlign.center,
                                      ).paddingHorizontal(6),
                                    ),
                                  ),
                                );
                              },
                            ).paddingBottom(16),
                  ),
                  GetButton(onTap: (){
                    if(provider.selectedState!=null){
                      context.read<AdsProvider>().showInterstitialAd(context);
                      provider.saveRecentState(provider.selectedState);
                      context.pushTo(DisclaimerScreen());
                    }

                  }, text: continueText,color: primaryColor,),

                ],
              ).paddingAll(16);
            },
          ),
        ),
      ),
    );
  }
}
